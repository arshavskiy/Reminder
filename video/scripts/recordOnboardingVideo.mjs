import {chromium} from "../../client/node_modules/@playwright/test/index.mjs";
import {mkdir, rename} from "node:fs/promises";
import {resolve} from "node:path";

const magicUrl = process.env.DEMO_MAGIC_LINK_URL;
if (!magicUrl) throw new Error("Set DEMO_MAGIC_LINK_URL before recording.");

const outputDir = resolve("video/recordings");
const rawDir = resolve("video/recordings/raw");
const logoPath = resolve("client/src/public/logo-options/option-b-r-mark.png");
const signaturePath = resolve("video/assets/demo-signature.png");
await mkdir(rawDir, {recursive: true});

const browser = await chromium.launch({headless: true});
const context = await browser.newContext({
  viewport: {width: 1440, height: 900},
  recordVideo: {dir: rawDir, size: {width: 1440, height: 900}},
});
const page = await context.newPage();
const video = page.video();
const pause = (ms) => page.waitForTimeout(ms);

async function caption(text, ms = 1200) {
  await page.evaluate((value) => {
    document.querySelector("#demo-caption")?.remove();
    const el = document.createElement("div");
    el.id = "demo-caption";
    el.textContent = value;
    Object.assign(el.style, {
      position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)",
      zIndex: "2147483647", padding: "12px 24px", borderRadius: "14px",
      background: "rgba(20,45,37,.94)", color: "white", font: "700 22px Arial", direction: "rtl",
    });
    document.body.appendChild(el);
  }, text);
  await pause(ms);
  await page.evaluate(() => document.querySelector("#demo-caption")?.remove());
}

await page.goto(magicUrl, {waitUntil: "networkidle"});
const welcomeDialog = page.getByRole("dialog").filter({hasText: "ברוכים הבאים ל-RemindOCR"});
if (!await welcomeDialog.isVisible().catch(() => false)) {
  await page.getByRole("button", {name: "השלמת ההגדרה"}).click();
  await welcomeDialog.waitFor({state: "visible"});
}
const dialog = page.getByRole("dialog").last();

await caption("השלמת ההגדרה — הגדרת העסק בפעם הראשונה", 1800);
await dialog.getByRole("button", {name: "הבא"}).click();
await dialog.getByPlaceholder("ישראל ישראלי").fill("דניאל כהן");
await dialog.getByPlaceholder("052-1234567").fill("050-555-2026");
await dialog.getByPlaceholder("לדוגמה: M.A.D הנדסה ובטיחות").fill("אופק בדיקות והנדסה");
await caption("פרטים אישיים ופרטי העסק", 1500);

await dialog.getByRole("button", {name: "הבא"}).click();
await dialog.getByPlaceholder("12345").fill("48192");
await dialog.getByPlaceholder("רחוב ומספר").fill("המסגר 18");
await dialog.getByPlaceholder("תל אביב").fill("תל אביב");
await dialog.getByPlaceholder("51646673").fill("515555555");
await dialog.getByPlaceholder("לדוגמה: 16125").fill("3001");
await caption("פרופיל מהנדס ומספור תסקירים", 1500);

await dialog.getByRole("button", {name: "הבא"}).click();
await dialog.locator(".n-form-item").filter({hasText: "שם חברה לתסקירים"}).locator("input").fill("אופק בדיקות והנדסה");
await dialog.getByPlaceholder("בדיקות בטיחות למתקני הרמה ומכלי לחץ").fill("בדיקות בטיחות ותסקירים תקופתיים");
await dialog.getByPlaceholder("052-8195650").fill("050-555-2026");
await dialog.getByPlaceholder("name@company.com").fill("office@ofek-demo.co.il");
await dialog.locator('input[type="file"]').setInputFiles(logoPath);
await dialog.getByAltText("לוגו").waitFor({state: "visible"});
await caption("לוגו החברה נשמר במסמכים", 1700);

await dialog.getByRole("button", {name: "הבא"}).click();
await dialog.locator('input[type="file"]').setInputFiles(signaturePath);
await dialog.getByAltText("חתימה").waitFor({state: "visible"});
await caption("העלאת חתימה אישית לתסקירים", 2200);

await dialog.getByRole("button", {name: /סיום והתחלה/}).click();
await dialog.waitFor({state: "hidden", timeout: 20000});
await caption("הפרופיל נשמר והמערכת מוכנה לעבודה", 1800);

const rawPath = await video.path();
await context.close();
await browser.close();
await rename(rawPath, resolve(outputDir, "RemindOCR-onboarding.webm"));
console.log(resolve(outputDir, "RemindOCR-onboarding.webm"));
