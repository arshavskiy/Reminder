import {chromium} from "../../client/node_modules/@playwright/test/index.mjs";
import {mkdir, rename} from "node:fs/promises";
import {resolve} from "node:path";

const appUrl = "http://localhost:4173";
const magicUrl = process.env.DEMO_MAGIC_LINK_URL;
const outputDir = resolve("video/recordings/pages");
if (!magicUrl) throw new Error("Set DEMO_MAGIC_LINK_URL before recording.");
await mkdir(outputDir, {recursive: true});

const browser = await chromium.launch({headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 900}, recordVideo: {dir: outputDir, size: {width: 1440, height: 900}}});
const auth = await context.newPage();
await auth.goto(magicUrl, {waitUntil: "networkidle"});
await auth.waitForTimeout(700);
const onboarding = auth.getByRole("dialog").filter({hasText: "ברוכים הבאים ל-RemindOCR"});
if (await onboarding.isVisible().catch(() => false)) await onboarding.getByRole("button", {name: "דלג על ההגדרה"}).click();
await auth.close();

async function caption(page, text) {
  await page.evaluate((value) => {
    const old = document.querySelector("#video-caption"); old?.remove();
    const el = document.createElement("div"); el.id = "video-caption"; el.textContent = value;
    Object.assign(el.style, {position:"fixed",top:"22px",left:"50%",transform:"translateX(-50%)",zIndex:"2147483647",padding:"12px 24px",borderRadius:"14px",background:"rgba(20,45,37,.92)",color:"white",font:"700 22px Arial",direction:"rtl"});
    document.body.appendChild(el);
  }, text);
  await page.waitForTimeout(1800);
  await page.evaluate(() => document.querySelector("#video-caption")?.remove());
}
async function record(name, route, title, action) {
  const page = await context.newPage(); const video = page.video();
  await page.goto(`${appUrl}${route}`, {waitUntil:"networkidle"}); await page.waitForTimeout(650);
  await caption(page, title);
  if (action) await action(page);
  await page.waitForTimeout(900);
  const raw = await video.path(); await page.close(); await rename(raw, resolve(outputDir, `${name}.webm`));
}

const docId = await (async () => {
  const page = await context.newPage();
  await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
  const result = await page.evaluate(async () => (await fetch("/api/documents?limit=1", {credentials:"include"})).json());
  await page.close(); return String(result.rows?.[0]?.id ?? result.rows?.[0]?._id ?? "");
})();

await record("01-dashboard", "/dashboard", "דשבורד — מסמכים, לקוחות ותזכורות במקום אחד");
await record("02-documents", "/documents", "מסמכים — 20 קבצי PDF לאחר OCR וחילוץ AI");
await record("03-document-detail", docId ? `/documents/${docId}` : "/documents", "פרטי מסמך — המידע שחולץ מהקובץ");
await record("04-inspections", "/contracts", "תסקירים — ניהול בדיקות ומכונות");
await record("05-quotes", "/quotes", "הצעות מחיר — סעיפי שירות ו-PDF");
await record("06-clients", "/clients", "לקוחות — פרטי קשר, מסמכים ותסקירים");
await record("07-reminders", "/reminders", "תזכורות — בדיקות קרובות ומעקב");
await record("08-reports", "/reports", "דוחות — הורדה ושליחה במייל");
await record("09-profile-settings", "/profile", "פרופיל והגדרות — לוגו, חתימה ומיתוג");

const tour = await context.newPage(); const tourVideo = tour.video();
for (const [route, title] of [["/dashboard", "דשבורד"], ["/documents", "מסמכים"], ["/contracts", "תסקירים"], ["/quotes", "הצעות מחיר"], ["/clients", "לקוחות"], ["/reminders", "תזכורות"], ["/reports", "דוחות"], ["/profile", "פרופיל והגדרות"]]) {
  await tour.goto(`${appUrl}${route}`, {waitUntil:"networkidle"}); await caption(tour, title);
}
const tourRaw = await tourVideo.path(); await tour.close(); await rename(tourRaw, resolve("video/recordings/RemindOCR-site-tour.webm"));
await context.close(); await browser.close();
console.log(outputDir);
