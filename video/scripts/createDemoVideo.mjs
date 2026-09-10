import {chromium} from "../../client/node_modules/@playwright/test/index.mjs";
import {mkdir, rename, readdir} from "node:fs/promises";
import {resolve} from "node:path";

const appUrl = "http://localhost:4173";
const magicUrl = process.env.DEMO_MAGIC_LINK_URL;
const rawDir = resolve("video/recordings/raw");
const logoPath = resolve("client/src/public/logo-options/option-b-r-mark.png");
const signaturePath = resolve("video/assets/demo-signature.png");
const demoPdfDir = resolve("output/pdf/demo-upload-files");
await mkdir(rawDir, {recursive: true});
if (!magicUrl) throw new Error("Set DEMO_MAGIC_LINK_URL to a local magic-link URL before running the video demo.");

const browser = await chromium.launch({headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 900}, recordVideo: {dir: rawDir, size: {width: 1440, height: 900}}, acceptDownloads: true});
await context.addInitScript(() => {
  localStorage.setItem("walkthrough_completed", JSON.stringify(["main", "documents", "contracts", "reminders", "clients", "reports"]));
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = ".demo-cursor{position:fixed;width:22px;height:22px;border:3px solid #18a058;border-radius:50%;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);box-shadow:0 0 0 3px rgba(255,255,255,.9)}.demo-ripple{position:fixed;width:16px;height:16px;border:3px solid #18a058;border-radius:50%;z-index:2147483646;pointer-events:none;transform:translate(-50%,-50%);animation:demo-ripple .55s ease-out forwards}@keyframes demo-ripple{to{width:58px;height:58px;opacity:0}}";
    document.head.appendChild(style); const cursor = document.createElement("div"); cursor.className = "demo-cursor"; document.body.appendChild(cursor);
    document.addEventListener("pointermove", event => { cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`; });
    document.addEventListener("click", event => { const ripple = document.createElement("div"); ripple.className = "demo-ripple"; ripple.style.left = `${event.clientX}px`; ripple.style.top = `${event.clientY}px`; document.body.appendChild(ripple); setTimeout(() => ripple.remove(), 600); }, true);
  });
});

const page = await context.newPage();
const video = page.video();
const pause = ms => page.waitForTimeout(ms);
const dialog = () => page.locator('[role="dialog"]').filter({hasText: "תסקיר חדש"}).last();
const field = label => dialog().locator(".hm-field").filter({has: page.locator("label").filter({hasText: new RegExp(`^${label}$`)})}).first();
async function caption(text, ms = 1100) {
  await page.evaluate(value => { document.querySelector("#demo-caption")?.remove(); const el = document.createElement("div"); el.id = "demo-caption"; el.textContent = value; Object.assign(el.style, {position: "fixed", top: "22px", left: "50%", transform: "translateX(-50%)", zIndex: "2147483645", padding: "12px 24px", borderRadius: "14px", background: "rgba(20,45,37,.92)", color: "white", font: "700 22px Arial", direction: "rtl", boxShadow: "0 10px 30px rgba(0,0,0,.22)"}); document.body.appendChild(el); }, text);
  await pause(ms); await page.evaluate(() => document.querySelector("#demo-caption")?.remove());
}
async function chooseSelection(selection, option) { await selection.click(); await pause(350); await page.getByText(option, {exact: true}).last().click(); await pause(500); }

async function completeProfile() {
  await page.goto(magicUrl, {waitUntil: "networkidle"}); await pause(800);
  const onboarding = page.getByRole("dialog").filter({hasText: "ברוכים הבאים ל-RemindOCR"});
  if (!await onboarding.isVisible().catch(() => false)) {
    await page.getByRole("button", {name: "השלמת ההגדרה"}).click();
    await onboarding.waitFor({state: "visible", timeout: 10000});
  }
  await pause(400); await caption("RemindOCR — הקמה מהירה של פרופיל עסקי", 1200);
  await page.getByRole("button", {name: "הבא"}).click(); await pause(350);
  await page.getByPlaceholder("ישראל ישראלי").fill("אופק מהנדסים"); await page.getByPlaceholder("052-1234567").fill("0586281637"); await page.getByPlaceholder("לדוגמה: M.A.D הנדסה ובטיחות").fill("אופק בדיקות והנדסה");
  await caption("פרטי המהנדס והעסק", 650); await page.getByRole("button", {name: "הבא"}).click(); await pause(350);
  await page.getByPlaceholder("12345").fill("48192"); await page.getByPlaceholder("רחוב ומספר").fill("המסגר 18"); await page.getByPlaceholder("תל אביב").fill("תל אביב"); await page.getByPlaceholder("51646673").fill("515555555"); await page.getByPlaceholder("לדוגמה: 16125").fill("2001");
  await page.getByRole("button", {name: "הבא"}).click(); await pause(400);
  await page.locator(".n-form-item").filter({hasText: "שם חברה לתסקירים"}).locator("input").fill("אופק בדיקות והנדסה"); await page.getByPlaceholder("בדיקות בטיחות למתקני הרמה ומכלי לחץ").fill("בדיקות בטיחות, תסקירים ותזכורות תקופתיות"); await page.getByPlaceholder("052-8195650").fill("0586281637"); await page.getByPlaceholder("name@company.com").fill("office@ofek-demo.co.il");
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles(logoPath); await caption("העלאת לוגו החברה", 800); await page.getByRole("button", {name: "הבא"}).click(); await pause(450);
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles(signaturePath);
  await page.getByRole("dialog").getByAltText("חתימה").waitFor({state: "visible", timeout: 5000});
  await caption("העלאת חתימה אישית לתסקירים", 2600);
  await page.getByRole("button", {name: /סיום והתחלה/}).click();
  await page.getByRole("dialog").waitFor({state: "hidden", timeout: 20000}); await pause(1000);
}

async function createInspection(item, index) {
  await caption(`יצירת תסקיר ${index + 1} מתוך 5 — ${item.type}`, 800); await page.getByRole("button", {name: /תסקיר חדש/}).click(); await pause(650);
  if (index > 0) await chooseSelection(field("סוג תסקיר").locator(".n-base-selection"), item.type);
  await field("מספר תסקיר").locator("input").fill(String(2001 + index)); const dates = dialog().getByPlaceholder("בחר תאריך"); await dates.first().fill(item.date); await dates.first().press("Enter"); await chooseSelection(field("מרווח בדיקות").locator(".n-base-selection"), "6 חודשים"); await field("מקום הבדיקה").locator("input").fill(item.city);
  await dialog().getByRole("button", {name: "הבא"}).click(); await pause(450);
  await field("שם העסק").locator("input").fill(item.client); await field("ח.פ / ת.ז").locator("input").fill(`51500${index + 1}00${index + 1}`); await field("איש קשר").locator("input").fill(item.contact); await field("טלפון").locator("input").fill(`03-55510${index + 1}${index + 1}`); await field("נייד").locator("input").fill(`050-55520${index + 1}${index + 1}`); await field("אימייל").locator("input").fill(`office${index + 1}@demo.co.il`); await field("כתובת").locator("input").fill(item.address); await field("יישוב").locator("input").fill(item.city);
  await dialog().getByRole("button", {name: "הבא"}).click(); await pause(450);
  await field("שם הציוד").locator("input").fill(item.equipment); await field("יצרן").locator("input").fill(item.maker); await field("מספר רישוי").locator("input").fill(`EQ-${2001 + index}`);
  await dialog().getByRole("button", {name: "הבא"}).click(); await pause(450); await dialog().getByRole("button", {name: "הבא"}).click(); await pause(450);
  if (index === 0) { await chooseSelection(field("מסמך שיופק עם התסקיר").locator(".n-base-selection"), "הצעת מחיר"); await caption("סעיפי המחיר נבחרים אוטומטית לפי סוג הציוד", 1100); }
  await dialog().getByRole("button", {name: "שמור ופתח תצוגה"}).click(); await page.waitForURL(/print-templates\/layout/, {timeout: 20000}); await pause(700);
  if (index === 0) { const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", {name: /הורד PDF/}).click(); const download = await downloadPromise; await download.saveAs(resolve("video/recordings/demo-inspection-report.pdf")); await caption("התסקיר והצעת המחיר נשמרו", 950); }
  await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"}); await pause(500);
}

async function uploadDemoPdfs() {
  const pdfFiles = (await readdir(demoPdfDir))
    .filter(name => name.toLowerCase().endsWith(".pdf"))
    .sort()
    .map(name => resolve(demoPdfDir, name));
  if (pdfFiles.length !== 20) throw new Error(`Expected 20 demo PDFs, found ${pdfFiles.length}`);

  await page.goto(`${appUrl}/documents`, {waitUntil: "networkidle"});
  await caption("העלאת 20 מסמכי הדגמה למערכת", 1100);
  await page.getByRole("button", {name: "העלה קבצים"}).click();
  const uploadDialog = page.locator('[role="dialog"]').filter({hasText: "העלאת מסמכים"});
  await uploadDialog.locator('input[type="file"]').setInputFiles(pdfFiles);
  await caption("20 קבצי PDF נבחרו לעיבוד אוטומטי", 1000);
  await uploadDialog.getByRole("button", {name: "העלה ועבד"}).click();
  await uploadDialog.waitFor({state: "hidden", timeout: 30000});
  await pause(1000);
}

async function showCalendarClientsAndDocument() {
  await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
  await pause(800);
  await page.getByRole("button", {name: "›"}).click();
  await caption("לוח שנה — תזכורות ובדיקות קרובות", 1200);

  await page.goto(`${appUrl}/clients`, {waitUntil: "networkidle"});
  await pause(900);
  await caption("לקוחות — כל העסקים ופרטי הקשר במקום אחד", 1100);

  await page.goto(`${appUrl}/documents`, {waitUntil: "networkidle"});
  await pause(900);
  await caption("מסמכים — כל קבצי ה-PDF שהועלו", 1100);
  const firstDocument = page.locator("tr.document-table-row").first();
  await firstDocument.waitFor({state: "visible", timeout: 30000});
  await firstDocument.click();
  await page.waitForURL(/\/documents\/[^/]+/, {timeout: 15000});
  await caption("מסמך בודד — פרטים, חילוץ נתונים ופעולות", 1200);
  await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
}

async function createMultiEquipmentInspection() {
  await caption("תסקיר חדש עם מספר מכונות והצעת מחיר", 1000);
  await page.getByRole("button", {name: /תסקיר חדש/}).click();
  await pause(650);
  await field("מספר תסקיר").locator("input").fill("2026-006");
  const dates = dialog().getByPlaceholder("בחר תאריך");
  await dates.first().fill("2026-10-20"); await dates.first().press("Enter");
  await chooseSelection(field("מרווח בדיקות").locator(".n-base-selection"), "6 חודשים");
  await field("מקום הבדיקה").locator("input").fill("מרכז לוגיסטי אופק, תל אביב");
  await dialog().getByRole("button", {name: "הבא"}).click(); await pause(450);

  await field("שם העסק").locator("input").fill("אופק לוגיסטיקה בע״מ");
  await field("ח.פ / ת.ז").locator("input").fill("515556666");
  await field("איש קשר").locator("input").fill("רוני לוי");
  await field("טלפון").locator("input").fill("03-5552026");
  await field("נייד").locator("input").fill("050-5552026");
  await field("אימייל").locator("input").fill("office@ofek-logistics.co.il");
  await field("כתובת").locator("input").fill("המסגר 18");
  await field("יישוב").locator("input").fill("תל אביב");
  await dialog().getByRole("button", {name: "הבא"}).click(); await pause(450);

  const fillEquipment = async (index, name, manufacturer, license) => {
    const row = dialog().locator(".hm-equipment").nth(index);
    await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "שם הציוד"})}).locator("input").fill(name);
    await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "יצרן"})}).locator("input").fill(manufacturer);
    await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "מספר רישוי"})}).locator("input").fill(license);
  };
  await fillEquipment(0, "מלגזה חשמלית 1", "Toyota", "FL-2026-01");
  await dialog().getByRole("button", {name: "הוסף מכונה"}).click(); await pause(250);
  await fillEquipment(1, "מלגזה חשמלית 2", "Toyota", "FL-2026-02");
  await dialog().getByRole("button", {name: "הוסף מכונה"}).click(); await pause(250);
  await fillEquipment(2, "במת הרמה", "Genie", "PL-2026-03");
  await caption("שלוש מכונות תחת אותו תסקיר", 900);
  await dialog().getByRole("button", {name: "הבא"}).click(); await pause(450);
  await dialog().getByRole("button", {name: "הבא"}).click(); await pause(450);

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
  await page.waitForURL(/print-templates\/layout/, {timeout: 20000});
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", {name: /הורד PDF/}).click();
  const download = await downloadPromise;
  await download.saveAs(resolve("video/recordings/demo-multi-equipment-report.pdf"));
  await caption("התסקיר והצעת המחיר נוצרו והורדו כ-PDF", 1100);
}

async function showWorkspaceAndReports() {
  await page.goto(`${appUrl}/documents`, {waitUntil: "networkidle"}); await pause(700);
  await caption("מסמכים", 700);
  await page.getByRole("link", {name: "תסקירים"}).click(); await page.waitForURL(/\/contracts/); await pause(800);
  await caption("תסקירים", 700);
  await page.getByRole("link", {name: "הצעות מחיר"}).click(); await page.waitForURL(/\/quotes/); await pause(800);
  await caption("הצעות מחיר — שמורות לצד התסקירים", 950);
  await page.goto(`${appUrl}/clients`, {waitUntil: "networkidle"}); await pause(800);
  await caption("לקוחות", 700);

  await page.goto(`${appUrl}/reports`, {waitUntil: "networkidle"}); await pause(1000);
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

const inspections = [
  {type: "תסקיר מכונות הרמה", date: "2026-05-05", client: "אלפא תעשיות בע״מ", contact: "דנה לוי", city: "תל אביב", address: "היצירה 12", equipment: "מלגזה חשמלית", maker: "Toyota"},
  {type: "תסקיר אביזרי הרמה", date: "2026-05-07", client: "בטא לוגיסטיקה בע״מ", contact: "יואב כהן", city: "חיפה", address: "הנמל 8", equipment: "שרשרת הרמה", maker: "Gunnebo"},
  {type: "תסקיר מעלית", date: "2026-05-09", client: "מגדלי העיר בע״מ", contact: "נועה ישראלי", city: "רמת גן", address: "דרך אבא הלל 20", equipment: "מעלית נוסעים", maker: "KONE"},
  {type: "תסקיר במת הרמה", date: "2026-05-11", client: "גמא אחזקות בע״מ", contact: "איתי ברק", city: "פתח תקווה", address: "הסיבים 14", equipment: "במת הרמה ניידת", maker: "Genie"},
  {type: "תסקיר פיגום ממוכן", date: "2026-05-13", client: "דלתא מערכות בע״מ", contact: "מאיה רז", city: "ראשון לציון", address: "לישנסקי 5", equipment: "פיגום ממוכן", maker: "Alimak"},
];

await completeProfile();
await uploadDemoPdfs();
await showCalendarClientsAndDocument();
await createMultiEquipmentInspection();
await showWorkspaceAndReports();
const rawPath = await video.path(); await context.close(); await browser.close(); await rename(rawPath, resolve("video/recordings/RemindOCR-demo-flow.webm")); console.log(resolve("video/recordings/RemindOCR-demo-flow.webm"));
