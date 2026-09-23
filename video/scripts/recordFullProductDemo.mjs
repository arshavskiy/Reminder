import {chromium} from "../../client/node_modules/@playwright/test/index.mjs";
import {mkdir, rename, rm} from "node:fs/promises";
import {resolve} from "node:path";
import {DEMO_LOGO, DEMO_SIGNATURE, dismissWalkthrough, listDemoPdfs, loginWithMagic} from "./demoAssets.mjs";

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

async function scrollDown(ms = 6000) {
    await page.evaluate(async (duration) => {
        const root = document.querySelector(".content")
            || document.querySelector(".shell-body")
            || document.scrollingElement
            || document.documentElement;
        const max = Math.max(0, root.scrollHeight - root.clientHeight);
        const frames = 12;
        const stepMs = duration / frames;
        for (let index = 1; index <= frames; index += 1) {
            root.scrollTop = (max * index) / frames;
            await new Promise(resolve => setTimeout(resolve, stepMs));
        }
    }, ms);
}

async function showPage(url, captionText) {
    if (url) await page.goto(url, {waitUntil: "domcontentloaded"});
    await dismissWalkthrough(page);
    if (captionText) await caption(captionText, 900);
    await scrollDown(6000);
}

async function scrollDialog(ms = 6000) {
    await page.evaluate(async (duration) => {
        const roots = [...document.querySelectorAll(".n-modal-container .n-card__content, .onboarding-card .n-card__content, .onboarding-body")];
        const root = roots.find((element) => element.getClientRects().length > 0);
        if (!root) {
            await new Promise(resolve => setTimeout(resolve, duration));
            return;
        }
        const max = Math.max(0, root.scrollHeight - root.clientHeight);
        const frames = 12;
        const stepMs = duration / frames;
        for (let index = 1; index <= frames; index += 1) {
            root.scrollTop = (max * index) / frames;
            await new Promise(resolve => setTimeout(resolve, stepMs));
        }
        root.scrollTop = 0;
    }, ms);
}

async function completeWelcomeOnboarding() {
    const welcome = page.getByRole("dialog").filter({hasText: "ברוכים הבאים ל-RemindOCR"});
    const open = page.getByRole("button", {name: "השלמת ההגדרה"});
    await welcome.or(open).first().waitFor({state: "visible", timeout: 15000}).catch(() => {});
    if (!await welcome.isVisible().catch(() => false) && await open.isVisible().catch(() => false)) {
        await open.click();
        await welcome.waitFor({state: "visible", timeout: 15000});
    }
    if (!await welcome.isVisible().catch(() => false)) return;

    await caption("ברוכים הבאים — המסלול שלכם", 1500);
    await scrollDialog();
    await pause(1200);
    await welcome.getByRole("button", {name: "הבא"}).click();

    await welcome.getByPlaceholder("ישראל ישראלי").fill("דניאל כהן");
    await welcome.getByPlaceholder("052-1234567").fill("050-555-2026");
    await welcome.getByPlaceholder("לדוגמה: M.A.D הנדסה ובטיחות").fill("אופק בדיקות והנדסה");
    await caption("פרטים אישיים ופרטי העסק", 1500);
    await scrollDialog();
    await welcome.getByRole("button", {name: "הבא"}).click();

    await welcome.getByPlaceholder("12345").fill("48192");
    await welcome.getByPlaceholder("רחוב ומספר").fill("המסגר 18");
    await welcome.getByPlaceholder("תל אביב").fill("תל אביב");
    await welcome.getByPlaceholder("לדוגמה: 51646673").fill("515555555");
    await welcome.getByPlaceholder("לדוגמה: 16125").fill("3001");
    await caption("פרופיל מהנדס ומספור תסקירים", 1500);
    await scrollDialog();
    await welcome.getByRole("button", {name: "הבא"}).click();

    await welcome.locator(".n-form-item").filter({hasText: "שם חברה לתסקירים"}).locator("input").fill("אופק בדיקות והנדסה");
    await welcome.getByPlaceholder("לדוגמה: בדיקות בטיחות למתקני הרמה ומכלי לחץ").fill("בדיקות בטיחות ותסקירים תקופתיים");
    await welcome.getByPlaceholder("052-1234567").last().fill("050-555-2026");
    await welcome.getByPlaceholder("name@company.com").fill("office@ofek-demo.co.il");
    await welcome.locator(".n-form-item").filter({hasText: "שם שולח במיילים"}).locator("input").fill("אופק בדיקות והנדסה");
    await welcome.locator('input[type="file"]').setInputFiles(DEMO_LOGO);
    await welcome.locator("img.logo-preview").waitFor({state: "visible", timeout: 15000});
    await caption("לוגו החברה מוצג במסמכים", 2000);
    await scrollDialog();
    await pause(2000);
    await welcome.getByRole("button", {name: "הבא"}).click();

    await welcome.locator('input[type="file"]').setInputFiles(DEMO_SIGNATURE);
    await welcome.locator("img.signature-preview").waitFor({state: "visible", timeout: 15000});
    await caption("חתימה אישית לתסקירים", 2000);
    await scrollDialog();
    await pause(2500);
    await welcome.getByRole("button", {name: "סיום והתחלה"}).click();
    await page.locator(".n-modal-container").waitFor({state: "hidden", timeout: 30000});
    await caption("ההגדרה הושלמה", 1500);
}

async function showFilledProfile() {
    await page.goto(`${appUrl}/profile?section=personal`, {waitUntil: "domcontentloaded"});
    await dismissWalkthrough(page);
    await page.getByText("דניאל כהן", {exact: true}).first().waitFor({state: "visible", timeout: 20000});
    await page.getByText("48192", {exact: true}).first().waitFor({state: "visible", timeout: 10000});
    await page.getByText("אופק בדיקות והנדסה").first().waitFor({state: "visible", timeout: 10000});
    await page.locator("img.logo-upload__preview").first().waitFor({state: "visible", timeout: 15000});
    await page.locator("img.logo-upload__preview--signature").waitFor({state: "visible", timeout: 15000});
    await caption("הגדרות הפרופיל — הפרטים, הלוגו והחתימה שנשמרו", 900);
    await scrollDown(6000);
}

async function uploadDemoPdfs() {
    const pdfFiles = (await listDemoPdfs()).filter((file) => /inspection-hebrew-\d+\.pdf$/i.test(file));
    if (!pdfFiles.length) throw new Error("No inspection-hebrew demo PDFs found.");
    await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
    await caption("העלאת תסקירי בדיקה מהדשבורד", 1200);
    await page.locator(".drop-strip").waitFor({state: "visible", timeout: 15000});
    await page.locator('input.hidden-file-input[type="file"]').setInputFiles(pdfFiles);
    const results = page.getByRole("dialog").filter({hasText: "תוצאות העלאה"});
    await results.waitFor({state: "visible", timeout: 15000});
    await caption(`${pdfFiles.length} קובצי PDF נשלחו ל־OCR ולחילוץ טבלאות ציוד`, 1400);
    await results.locator(".ur-progress").waitFor({state: "hidden", timeout: 420000});
    const uploadText = await results.innerText().catch(() => "");
    console.log(`UPLOAD RESULTS:\n${uploadText.slice(0, 2500)}`);
    const uploadSummary = uploadText.replace(/\s+/g, " ").match(/(?:^|\s)(\d+) קבצים\s*·\s*(\d+) נכשלו/);
    if (uploadSummary && uploadSummary[1] === uploadSummary[2]) {
        throw new Error("All demo uploads failed.");
    }
    await caption("כל הקבצים הושלמו — לקוח, יצרן ודגם חולצו", 3000);
    const documentsButton = results.getByRole("button", {name: "עבור למסמכים"});
    await documentsButton.hover();
    await pause(500);
    await documentsButton.click();
    await page.waitForURL(/\/documents/, {timeout: 20000});
    await showPage(null, "תסקירים — כל קבצי ה-PDF שהועלו");
}

const CALENDAR_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

function calendarMonthIndex(label) {
    const hebrew = CALENDAR_MONTHS.findIndex((name) => label.includes(name));
    if (hebrew >= 0) return hebrew;
    const english = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    return english.findIndex((name) => label.toLowerCase().includes(name));
}

async function showDashboardAtExpiry() {
    await page.goto(`${appUrl}/dashboard`, {waitUntil: "domcontentloaded"});
    await dismissWalkthrough(page);
    const label = page.locator(".rcal__nav-label");
    await label.waitFor({state: "visible", timeout: 20000});
    await label.scrollIntoViewIfNeeded();
    await caption("לוח שנה — חודש התוקף של הבדיקות שהועלו", 900);
    const target = {year: 2027, month: 2};
    for (let step = 0; step < 24; step += 1) {
        const text = (await label.innerText()).replace(/\s+/g, " ");
        const year = Number(text.match(/20\d{2}/)?.[0]);
        const month = calendarMonthIndex(text);
        if (year === target.year && month === target.month) break;
        const forward = !year || month < 0 || year < target.year || (year === target.year && month < target.month);
        await page.locator(".rcal__nav-btn").nth(forward ? 1 : 0).click();
        await pause(450);
    }
    await page.locator(".rcal__pill--expiry, .rcal__pill").first().waitFor({state: "visible", timeout: 15000}).catch(() => {});
    await pause(2500);
}

async function showCalendarClientsAndDocument() {
    await showPage(`${appUrl}/clients`, "לקוחות — כל העסקים ופרטי הקשר במקום אחד");

    await showPage(`${appUrl}/documents`, "תסקירים — כל קבצי ה-PDF שהועלו");
    const firstDocument = page.locator("tr.document-table-row").first();
    const hasDocument = await firstDocument.waitFor({state: "visible", timeout: 20000}).then(() => true).catch(() => false);
    if (hasDocument) {
        await firstDocument.locator(".document-col--file").click();
        await page.waitForURL(/\/documents\/[^/]+/, {timeout: 15000});
        await showPage(null, "מסמך בודד — פרטים, חילוץ נתונים ופעולות");
    } else {
        console.log("DOCUMENTS PAGE:\n" + (await page.locator("main, .content").first().innerText().catch(() => "")).slice(0, 1500));
        await caption("רשימת התסקירים", 1500);
    }

    await showDashboardAtExpiry();
    await showPage(`${appUrl}/equipment`, "ציוד — הכותרת היא יצרן ודגם, לא תיאור הטבלה");
}

async function createMultiEquipmentInspection() {
    await page.goto(`${appUrl}/documents`, {waitUntil: "domcontentloaded"});
    await dismissWalkthrough(page);
    await caption("תסקיר חדש עם מספר מכונות והצעת מחיר", 1000);
    const newInspection = page.getByRole("button", {name: "תסקיר חדש"}).first();
    await newInspection.waitFor({state: "visible", timeout: 20000});
    await newInspection.click();
    await pause(650);
    await field("מספר תסקיר").locator("input").fill(`VID-${Date.now().toString().slice(-6)}`);
    const dates = dialog().getByPlaceholder("בחר תאריך");
    await dates.first().fill("2026-09-10");
    await dates.first().press("Enter");
    await chooseSelection(field("מרווח בדיקות").locator(".n-base-selection"), "6 חודשים");
    await field("מקום הבדיקה").locator("input").fill("מרכז לוגיסטי אופק, תל אביב");
    await dialog().getByRole("button", {name: "הבא"}).click();
    await pause(450);

    await field("שם העסק").locator("input").fill("אופק לוגיסטיקה בע״מ");
    await field("איש קשר").locator("input").fill("רוני לוי");
    await field("טלפון").locator("input").fill("050-5552026");
    await field("נייד").locator("input").fill("050-5552026");
    await field("אימייל").locator("input").fill("office@ofek-logistics.co.il");
    await field("כתובת").locator("input").fill("המסגר 18");
    await field("יישוב").locator("input").fill("תל אביב");
    await dialog().getByRole("button", {name: "הבא"}).click();
    await pause(450);

    const addDynamicValue = async (row, label, value) => {
        const dynamicField = row.locator(".hm-field").filter({has: page.locator("label").filter({hasText: new RegExp(`^${label}`)})});
        const existingTags = dynamicField.locator(".n-tag__close");
        while (await existingTags.count()) await existingTags.first().click();
        const input = dynamicField.getByRole("textbox");
        if (!await input.isVisible().catch(() => false)) await dynamicField.getByRole("button").last().click();
        await input.waitFor({state: "visible", timeout: 5000});
        await input.fill(value);
        await input.press("Enter");
        await pause(150);
    };
    const fillEquipment = async (index, equipment) => {
        const row = dialog().locator(".hm-equipment").nth(index);
        await row.scrollIntoViewIfNeeded();
        await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "שם הציוד"})}).locator("input").fill(equipment.name);
        await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "יצרן"})}).locator("input").fill(equipment.manufacturer);
        await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "מספר רישוי"})}).locator("input").fill(equipment.license);
        await addDynamicValue(row, "דגם", equipment.model);
        await addDynamicValue(row, "מס׳ סידורי", equipment.serial);
        await addDynamicValue(row, "עומס עבודה בטוח", equipment.workLoad);
        await addDynamicValue(row, "עומס מבחן", equipment.testLoad);
        await addDynamicValue(row, "רדיוס עומס", equipment.radius);
        await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "תיאור ציוד"})}).locator("textarea").fill(equipment.description);
    };
    const machines = [
        {
            name: "מלגזה חשמלית", manufacturer: "Toyota", license: "FL-2026-01",
            model: "8FBEKT16", serial: "TY-16001", workLoad: "1600", testLoad: "2000", radius: "0.50",
            description: "מלגזה חשמלית תלת גלגלית, תורן דו שלבי",
        },
        {
            name: "מלגזה חשמלית", manufacturer: "Toyota", license: "",
            model: "8FBET18", serial: "TY-18002", workLoad: "1800", testLoad: "2250", radius: "0.50",
            description: "מלגזה חשמלית ארבע גלגלית, תורן תלת שלבי",
        },
        {
            name: "במת הרמה", manufacturer: "Genie", license: "",
            model: "GS-1932", serial: "GN-193203", workLoad: "227", testLoad: "284", radius: "0",
            description: "במת הרמה מספריים חשמלית לעבודה בגובה",
        },
    ];
    for (let index = 0; index < machines.length; index += 1) {
        if (index > 0) {
            await dialog().getByRole("button", {name: "הוסף מכונה"}).click();
            await pause(250);
        }
        await fillEquipment(index, machines[index]);
    }
    await caption("שלוש מכונות — דגם, מספר סידורי ועומסים כמו בתסקיר שהועלה", 1200);
    await dialog().getByRole("button", {name: "הבא"}).click();
    await pause(450);
    await dialog().getByRole("button", {name: "הצעת מחיר (רשות)"}).click();
    const quoteSelect = field("מסמך שיופק עם התסקיר").locator(".n-base-selection");
    await quoteSelect.waitFor({state: "visible", timeout: 15000});
    await quoteSelect.scrollIntoViewIfNeeded();
    await chooseSelection(quoteSelect, "הצעת מחיר");
    const billing = dialog().locator(".quote-billing");
    await billing.waitFor({state: "visible", timeout: 15000});
    await billing.getByPlaceholder("YYYY-MM-DD").fill("2026-10-10");
    const lines = billing.locator(".quote-billing__line");
    await lines.first().waitFor({state: "visible", timeout: 10000});
    const prices = ["850", "850", "950"];
    const lineCount = Math.min(await lines.count(), prices.length);
    for (let index = 0; index < lineCount; index += 1) {
        const row = lines.nth(index);
        await row.getByRole("checkbox").check();
        await row.getByLabel("מחיר יחידה").locator("input").fill(prices[index]);
    }
    await caption("הצעת מחיר — סעיף אחד לכל מכונה", 900);
    await scrollDialog(6000);
    await dialog().getByRole("button", {name: "שמור ופתח תצוגה"}).click();
    await page.waitForURL(/print-templates\/layout/, {timeout: 45000});
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", {name: /תיצור תסקיר/}).click();
    const download = await downloadPromise;
    await download.saveAs(resolve("video/recordings/demo-multi-equipment-report.pdf"));
    await caption("התסקיר והצעת המחיר נוצרו והורדו כ-PDF", 1100);
}

async function showWorkspaceAndReports() {
    await showPage(`${appUrl}/documents`, "תסקירים");
    const quotesLink = page.getByRole("link", {name: "הצעות מחיר"});
    if (await quotesLink.first().isVisible().catch(() => false)) {
        await quotesLink.first().click();
        await page.waitForURL(/\/quotes/);
        await showPage(null, "הצעות מחיר — שמורות לצד התסקירים");
    }
    await showPage(`${appUrl}/equipment`, "ציוד שחולץ מהתסקירים");
    await showPage(`${appUrl}/clients`, "לקוחות");
    await showPage(`${appUrl}/reports`, "דוחות — הפקה, הורדה ושליחה במייל");
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
await completeWelcomeOnboarding();
await showFilledProfile();
await uploadDemoPdfs();
await showCalendarClientsAndDocument();
await createMultiEquipmentInspection();
await showWorkspaceAndReports();
const rawPath = await video.path();
await context.close();
await browser.close();
const outputPath = resolve(`video/recordings/RemindOCR-full-product-demo-${new Date().toISOString().slice(0, 10)}.webm`);
await rm(outputPath, {force: true});
await rename(rawPath, outputPath);
console.log(outputPath);
