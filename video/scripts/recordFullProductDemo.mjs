import {chromium} from "../../client/node_modules/@playwright/test/index.mjs";
import {mkdir, rename} from "node:fs/promises";
import {resolve} from "node:path";
import {dismissWalkthrough, listDemoPdfs, loginWithMagic} from "./demoAssets.mjs";

const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const target = arg("target") ?? process.env.DEMO_TARGET ?? "local";
const appUrl = (arg("app-url") ?? process.env.DEMO_APP_URL ?? (target === "production" ? "https://app.remindocr.com" : "http://localhost:4173")).replace(/\/$/, "");
const magicUrl = arg("magic-url") ?? process.env.DEMO_MAGIC_LINK_URL;
const rawDir = resolve("video/recordings/raw");
await mkdir(rawDir, {recursive: true});
if (!magicUrl) throw new Error("Set DEMO_MAGIC_LINK_URL or --magic-url before running the video demo.");
if (target === "production" && (!appUrl.startsWith("https://") || !magicUrl.startsWith("https://"))) throw new Error("Production recording requires HTTPS URLs.");

const browser = await chromium.launch({headless: true});
const context = await browser.newContext({
    viewport: {width: 1440, height: 900},
    recordVideo: {dir: rawDir, size: {width: 1440, height: 900}},
    acceptDownloads: true,
    serviceWorkers: "block",
});
await context.addInitScript(() => {
    localStorage.setItem("walkthrough_completed", JSON.stringify(["main", "documents", "contracts", "reminders", "clients", "reports"]));
    document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = ".demo-cursor{position:fixed;width:22px;height:22px;border:3px solid #18a058;border-radius:50%;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);box-shadow:0 0 0 3px rgba(255,255,255,.9)}.demo-ripple{position:fixed;width:16px;height:16px;border:3px solid #18a058;border-radius:50%;z-index:2147483646;pointer-events:none;transform:translate(-50%,-50%);animation:demo-ripple .55s ease-out forwards}@keyframes demo-ripple{to{width:58px;height:58px;opacity:0}}";
        document.head.appendChild(style);
        const cursor = document.createElement("div");
        cursor.className = "demo-cursor";
        document.body.appendChild(cursor);
        document.addEventListener("pointermove", event => {
            cursor.style.left = `${event.clientX}px`;
            cursor.style.top = `${event.clientY}px`;
        });
        document.addEventListener("click", event => {
            const ripple = document.createElement("div");
            ripple.className = "demo-ripple";
            ripple.style.left = `${event.clientX}px`;
            ripple.style.top = `${event.clientY}px`;
            document.body.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        }, true);
    });
});

const page = await context.newPage();
const video = page.video();
const pause = ms => page.waitForTimeout(ms);
const dialog = () => page.locator('[role="dialog"]').filter({hasText: "תסקיר חדש"}).last();
const field = label => dialog().locator(".hm-field").filter({has: page.locator("label").filter({hasText: new RegExp(`^${label}$`)})}).first();

async function caption(text, ms = 1100) {
    await page.evaluate(value => {
        document.querySelector("#demo-caption")?.remove();
        const el = document.createElement("div");
        el.id = "demo-caption";
        el.textContent = value;
        Object.assign(el.style, {
            position: "fixed",
            top: "22px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "2147483645",
            padding: "12px 24px",
            borderRadius: "14px",
            background: "rgba(20,45,37,.92)",
            color: "white",
            font: "700 22px Arial",
            direction: "rtl",
            boxShadow: "0 10px 30px rgba(0,0,0,.22)"
        });
        document.body.appendChild(el);
    }, text);
    await pause(ms);
    await page.evaluate(() => document.querySelector("#demo-caption")?.remove());
}

async function chooseSelection(selection, option) {
    await selection.click();
    await pause(350);
    await page.getByText(option, {exact: true}).last().click();
    await pause(500);
}

async function uploadDemoPdfs() {
    const pdfFiles = await listDemoPdfs();
    await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
    await caption("העלאת תסקירי בדיקה מהדשבורד", 1200);
    await page.locator(".drop-strip").waitFor({state: "visible", timeout: 15000});
    await page.locator('input.hidden-file-input[type="file"]').setInputFiles(pdfFiles);
    const results = page.getByRole("dialog").filter({hasText: "תוצאות העלאה"});
    await results.waitFor({state: "visible", timeout: 15000});
    await caption(`${pdfFiles.length} קובצי PDF נשלחו ל־OCR ולחילוץ טבלאות ציוד`, 1400);
    await results.locator(".ur-progress").waitFor({state: "hidden", timeout: 420000});
    await caption("כל הקבצים הושלמו — לקוח, יצרן ודגם חולצו", 3000);
    const documentsButton = results.getByRole("button", {name: "עבור למסמכים"});
    await documentsButton.hover();
    await pause(500);
    await documentsButton.click();
    await page.waitForURL(/\/documents/, {timeout: 20000});
    await pause(3000);
}

async function showCalendarClientsAndDocument() {
    await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
    await pause(800);
    const nextMonth = page.locator(".rcal__nav-btn").nth(1);
    if (await nextMonth.isVisible().catch(() => false)) await nextMonth.click();
    await caption("לוח שנה — תזכורות ובדיקות קרובות", 1200);

    await page.goto(`${appUrl}/clients`, {waitUntil: "networkidle"});
    await pause(900);
    await caption("לקוחות — כל העסקים ופרטי הקשר במקום אחד", 1100);

    await page.goto(`${appUrl}/documents`, {waitUntil: "networkidle"});
    await pause(900);
    await caption("תסקירים — כל קבצי ה-PDF שהועלו", 1100);
    const firstDocument = page.locator("tr.document-table-row").first();
    await firstDocument.waitFor({state: "visible", timeout: 30000});
    await dismissWalkthrough(page);
    await firstDocument.locator(".document-col--file").click();
    await page.waitForURL(/\/documents\/[^/]+/, {timeout: 15000});
    await caption("מסמך בודד — פרטים, חילוץ נתונים ופעולות", 1200);

    await page.goto(`${appUrl}/equipment`, {waitUntil: "networkidle"});
    await pause(1000);
    await caption("ציוד — הכותרת היא יצרן ודגם, לא תיאור הטבלה", 1800);
    await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
}

async function createMultiEquipmentInspection() {
    await caption("תסקיר חדש עם מספר מכונות והצעת מחיר", 1000);
    const newInspection = page.locator(".dash__new-contract").filter({hasText: "תסקיר חדש"}).first();
    await newInspection.waitFor({state: "visible", timeout: 20000});
    await newInspection.click();
    await pause(650);
    await field("מספר תסקיר").locator("input").fill(`VID-${Date.now().toString().slice(-6)}`);
    const dates = dialog().getByPlaceholder("בחר תאריך");
    await dates.first().fill("2026-10-20");
    await dates.first().press("Enter");
    await chooseSelection(field("מרווח בדיקות").locator(".n-base-selection"), "6 חודשים");
    await field("מקום הבדיקה").locator("input").fill("מרכז לוגיסטי אופק, תל אביב");
    await dialog().getByRole("button", {name: "הבא"}).click();
    await pause(450);
    
    await field("שם העסק").locator("input").fill("אופק לוגיסטיקה בע״מ");
    await field("ח.פ / ת.ז").locator("input").fill("515556666");
    await field("איש קשר").locator("input").fill("רוני לוי");
    await field("טלפון").locator("input").fill("03-5552026");
    await field("נייד").locator("input").fill("050-5552026");
    await field("אימייל").locator("input").fill("office@ofek-logistics.co.il");
    await field("כתובת").locator("input").fill("המסגר 18");
    await field("יישוב").locator("input").fill("תל אביב");
    await dialog().getByRole("button", {name: "הבא"}).click();
    await pause(450);
    
    const fillEquipment = async (index, name, manufacturer, license, model) => {
        const row = dialog().locator(".hm-equipment").nth(index);
        await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "שם הציוד"})}).locator("input").fill(name);
        await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "יצרן"})}).locator("input").fill(manufacturer);
        await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "מספר רישוי"})}).locator("input").fill(license);
        const modelField = row.locator(".hm-field").filter({has: page.locator("label").filter({hasText: /^דגם/})});
        const modelInput = modelField.getByRole("textbox");
        if (await modelInput.isVisible().catch(() => false)) {
            await modelInput.fill(model);
            await modelInput.press("Enter");
        }
    };
    await fillEquipment(0, "מלגזה חשמלית", "Toyota", "FL-2026-01", "8FBEKT16");
    await dialog().getByRole("button", {name: "הוסף מכונה"}).click();
    await pause(250);
    await fillEquipment(1, "מלגזה חשמלית", "Toyota", "FL-2026-02", "8FBET18");
    await dialog().getByRole("button", {name: "הוסף מכונה"}).click();
    await pause(250);
    await fillEquipment(2, "במת הרמה", "Genie", "PL-2026-03", "GS-1932");
    await caption("שלוש מכונות — הכותרת תהיה יצרן ודגם", 900);
    await dialog().getByRole("button", {name: "הבא"}).click();
    await pause(450);
    await dialog().getByRole("button", {name: "הבא"}).click();
    await pause(450);
    
    await chooseSelection(field("מסמך שיופק עם התסקיר").locator(".n-base-selection"), "הצעת מחיר");
    await field("בתוקף / לתשלום עד").locator("input").fill("2026-11-20");
    for (let index = 0; index < 4; index++) await dialog().getByRole("button", {name: "הוספת סעיף"}).click();
    const lines = dialog().locator(".hm-billing-line");
    const services = [
        ["בדיקת מלגזה", "בדיקה תקופתית למלגזה חשמלית", "850"],
        ["בדיקת במת הרמה", "בדיקה תקופתית לבמת הרמה", "950"],
        ["הפקת תסקיר", "הפקת תסקיר חתום ושליחה ללקוח", "320"],
        ["תזכורת תקופתית", "הקמת תזכורת אוטומטית לבדיקה הבאה", "180"],
    ];
    const lineCount = await lines.count();
    for (let index = 0; index < lineCount; index++) {
        const row = lines.nth(index);
        const service = services[index % services.length];
        await row.getByRole("checkbox").check();
        await row.getByLabel("סעיף בדיקה").locator("input").fill(service[0]);
        await row.getByLabel("תיאור השירות").locator("input").fill(service[1]);
        await row.getByLabel("מחיר יחידה").locator("input").fill(service[2]);
    }
    await caption("הצעת מחיר עם מספר סעיפי שירות", 1100);
    await dialog().getByRole("button", {name: "שמור ופתח תצוגה"}).click();
    await page.waitForURL(/print-templates\/layout/, {timeout: 45000});
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", {name: /הורד PDF/}).click();
    const download = await downloadPromise;
    await download.saveAs(resolve("video/recordings/demo-multi-equipment-report.pdf"));
    await caption("התסקיר והצעת המחיר נוצרו והורדו כ-PDF", 1100);
}

async function showWorkspaceAndReports() {
    await page.goto(`${appUrl}/documents`, {waitUntil: "networkidle"});
    await pause(700);
    await caption("תסקירים", 900);
    const quotesTab = page.locator(".documents-workspace-tabs a").filter({hasText: "הצעות מחיר"});
    if (await quotesTab.isVisible().catch(() => false)) {
        await quotesTab.click();
        await page.waitForURL(/\/quotes/);
        await pause(1800);
        await caption("הצעות מחיר — שמורות לצד התסקירים", 950);
    }
    await page.goto(`${appUrl}/equipment`, {waitUntil: "networkidle"});
    await pause(900);
    await caption("ציוד שחולץ מהתסקירים", 900);
    await page.goto(`${appUrl}/clients`, {waitUntil: "networkidle"});
    await pause(800);
    await caption("לקוחות", 700);

    await page.goto(`${appUrl}/reports`, {waitUntil: "networkidle"});
    await pause(1000);
    await caption("דוחות — הפקה, הורדה ושליחה במייל", 1000);
    const selections = page.locator(".generator-controls .n-base-selection");
    await chooseSelection(selections.first(), "2026");
    const month = selections.nth(1);
    const clear = month.locator(".n-base-selection__clear");
    if (await clear.count()) await clear.click();
    await caption("דוח שנתי לשנת 2026", 800);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", {name: "הורד DOCX"}).click();
    const download = await downloadPromise;
    await download.saveAs(resolve("video/recordings/demo-annual-report-2026.docx"));
    await page.getByRole("button", {name: "שלח דוח כולל אליי"}).click();
    await caption("הדוח החודשי נשלח במייל", 1200);
}

await loginWithMagic(page, magicUrl, appUrl);
await page.goto(`${appUrl}/dashboard`, {waitUntil: "domcontentloaded"});
const onboarding = page.getByRole("dialog").filter({hasText: "ברוכים הבאים ל-RemindOCR"});
if (await onboarding.isVisible().catch(() => false)) await onboarding.getByRole("button", {name: "דלג על ההגדרה"}).click();
await uploadDemoPdfs();
await showCalendarClientsAndDocument();
await createMultiEquipmentInspection();
await showWorkspaceAndReports();
const rawPath = await video.path();
await context.close();
await browser.close();
const outputPath = resolve(`video/recordings/RemindOCR-full-product-demo-${new Date().toISOString().slice(0, 10)}.webm`);
await rename(rawPath, outputPath);
console.log(outputPath);
