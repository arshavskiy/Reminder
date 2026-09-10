import {chromium} from "@playwright/test";
import {mkdir, rename} from "node:fs/promises";
import {resolve} from "node:path";

const appUrl = "http://localhost:4173";
const magicUrl = process.env.DEMO_MAGIC_LINK_URL;
const rawDir = resolve("../output/video/raw");
const logoPath = resolve("src/public/logo-options/option-b-r-mark.png");
const signaturePath = resolve("tmp/demo-signature.png");
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
  await page.goto(magicUrl, {waitUntil: "networkidle"}); await pause(800); await page.getByRole("button", {name: "השלמת ההגדרה"}).click(); await pause(400); await caption("RemindOCR — הקמה מהירה של פרופיל עסקי", 1200);
  await page.getByRole("button", {name: "הבא"}).click(); await pause(350);
  await page.getByPlaceholder("ישראל ישראלי").fill("אופק מהנדסים"); await page.getByPlaceholder("052-1234567").fill("0586281637"); await page.getByPlaceholder("לדוגמה: M.A.D הנדסה ובטיחות").fill("אופק בדיקות והנדסה");
  await caption("פרטי המהנדס והעסק", 650); await page.getByRole("button", {name: "הבא"}).click(); await pause(350);
  await page.getByPlaceholder("12345").fill("48192"); await page.getByPlaceholder("רחוב ומספר").fill("המסגר 18"); await page.getByPlaceholder("תל אביב").fill("תל אביב"); await page.getByPlaceholder("51646673").fill("515555555"); await page.getByPlaceholder("לדוגמה: 16125").fill("2001");
  await page.getByRole("button", {name: "הבא"}).click(); await pause(400);
  await page.locator(".n-form-item").filter({hasText: "שם חברה לתסקירים"}).locator("input").fill("אופק בדיקות והנדסה"); await page.getByPlaceholder("בדיקות בטיחות למתקני הרמה ומכלי לחץ").fill("בדיקות בטיחות, תסקירים ותזכורות תקופתיות"); await page.getByPlaceholder("052-8195650").fill("0586281637"); await page.getByPlaceholder("name@company.com").fill("office@ofek-demo.co.il");
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles(logoPath); await caption("העלאת לוגו החברה", 800); await page.getByRole("button", {name: "הבא"}).click(); await pause(450);
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles(signaturePath); await caption("העלאת חתימה למסמכים", 800); await page.getByRole("button", {name: /סיום והתחלה/}).click();
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
  if (index === 0) { const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", {name: /הורד PDF/}).click(); const download = await downloadPromise; await download.saveAs(resolve("../output/video/demo-inspection-report.pdf")); await caption("התסקיר והצעת המחיר נשמרו", 950); }
  await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"}); await pause(500);
}

const inspections = [
  {type: "תסקיר מכונות הרמה", date: "2026-05-05", client: "אלפא תעשיות בע״מ", contact: "דנה לוי", city: "תל אביב", address: "היצירה 12", equipment: "מלגזה חשמלית", maker: "Toyota"},
  {type: "תסקיר אביזרי הרמה", date: "2026-05-07", client: "בטא לוגיסטיקה בע״מ", contact: "יואב כהן", city: "חיפה", address: "הנמל 8", equipment: "שרשרת הרמה", maker: "Gunnebo"},
  {type: "תסקיר מעלית", date: "2026-05-09", client: "מגדלי העיר בע״מ", contact: "נועה ישראלי", city: "רמת גן", address: "דרך אבא הלל 20", equipment: "מעלית נוסעים", maker: "KONE"},
  {type: "תסקיר במת הרמה", date: "2026-05-11", client: "גמא אחזקות בע״מ", contact: "איתי ברק", city: "פתח תקווה", address: "הסיבים 14", equipment: "במת הרמה ניידת", maker: "Genie"},
  {type: "תסקיר פיגום ממוכן", date: "2026-05-13", client: "דלתא מערכות בע״מ", contact: "מאיה רז", city: "ראשון לציון", address: "לישנסקי 5", equipment: "פיגום ממוכן", maker: "Alimak"},
];

await completeProfile();
for (let index = 0; index < inspections.length; index++) await createInspection(inspections[index], index);
await page.goto(`${appUrl}/clients`, {waitUntil: "networkidle"}); await pause(900); await caption("לקוחות — כל העסקים ופרטי הקשר במקום אחד", 1200);
await page.goto(`${appUrl}/documents`, {waitUntil: "networkidle"}); await pause(900); await caption("מסמכים — תסקירים שנשמרו ונגישים בכל עת", 1200);
await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"}); await pause(800); await page.getByRole("button", {name: "›"}).click(); await pause(900); await caption("אוקטובר 2026 — חמש התזכורות הבאות בלוח השנה", 1600);
const rawPath = await video.path(); await context.close(); await browser.close(); await rename(rawPath, resolve("../output/video/RemindOCR-demo-flow.webm")); console.log(resolve("../output/video/RemindOCR-demo-flow.webm"));
