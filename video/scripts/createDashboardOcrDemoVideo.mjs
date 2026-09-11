import {chromium} from "../../client/node_modules/@playwright/test/index.mjs";
import {mkdir, rename} from "node:fs/promises";
import {resolve} from "node:path";
import {dismissWalkthrough, listDemoPdfs, loginWithMagic} from "./demoAssets.mjs";

const appUrl = process.env.DEMO_APP_URL ?? "http://localhost:4173";
const magicUrl = process.env.DEMO_MAGIC_LINK_URL;
const rawDir = resolve("video/recordings/raw");
if (!magicUrl) throw new Error("Set DEMO_MAGIC_LINK_URL before recording.");
await mkdir(rawDir, {recursive: true});

const browser = await chromium.launch({headless: true});
const context = await browser.newContext({
  viewport: {width: 1440, height: 900},
  recordVideo: {dir: rawDir, size: {width: 1440, height: 900}},
  serviceWorkers: "block",
});
const page = await context.newPage();
const video = page.video();
const pause = (ms) => page.waitForTimeout(ms);

async function caption(text, ms = 1200) {
  await page.evaluate((value) => {
    document.querySelector("#demo-caption")?.remove();
    const node = document.createElement("div");
    node.id = "demo-caption";
    node.textContent = value;
    Object.assign(node.style, {position: "fixed", top: "22px", left: "50%", transform: "translateX(-50%)", zIndex: "2147483645", padding: "12px 24px", borderRadius: "14px", background: "rgba(20,45,37,.92)", color: "white", font: "700 22px Arial", direction: "rtl"});
    document.body.appendChild(node);
  }, text);
  await pause(ms);
  await page.evaluate(() => document.querySelector("#demo-caption")?.remove());
}

const pdfs = await listDemoPdfs();

await loginWithMagic(page, magicUrl, appUrl);
const onboarding = page.getByRole("dialog").filter({hasText: "ברוכים הבאים ל-RemindOCR"});
if (await onboarding.isVisible().catch(() => false)) {
  await onboarding.getByRole("button", {name: "דלג על ההגדרה"}).click();
  await onboarding.waitFor({state: "hidden"});
}
await page.goto(`${appUrl}/dashboard`, {waitUntil: "domcontentloaded"});
await caption("העלאה ישירה מהדשבורד", 1200);

await page.locator(".drop-strip").waitFor({state: "visible"});
await page.locator('input.hidden-file-input[type="file"]').setInputFiles(pdfs);
await caption(`${pdfs.length} קובצי PDF נשלחו ל-OCR ולחילוץ טבלאות ציוד`, 1500);
const results = page.getByRole("dialog").filter({hasText: "תוצאות העלאה"});
await results.waitFor({state: "visible", timeout: 10000});
await results.locator(".ur-progress").waitFor({state: "hidden", timeout: 420000});
await results.getByText(/הושלם|ההעלאה הושלמה|נכשלו/).first().waitFor({state: "visible", timeout: 10000});
await caption("העיבוד הושלם — לקוחות, תאריכים וסעיפים חולצו", 1500);
await results.getByRole("button", {name: "עבור למסמכים"}).click();
await page.waitForURL(/\/documents/);
await pause(1000);
await caption("מסמכים — פרטי החילוץ זמינים כבר ברשימה", 1400);

const documentRow = page.locator("tr.document-table-row").first();
await documentRow.waitFor({state: "visible", timeout: 20000});
await dismissWalkthrough(page);
await documentRow.locator(".document-col--file").click();
await page.waitForURL(/\/documents\/[^/]+/, {timeout: 15000});
await caption("מסמך בודד — נתונים שחולצו ב-OCR וב-AI", 1600);

const rawPath = await video.path();
await context.close();
await browser.close();
await rename(rawPath, resolve("video/recordings/RemindOCR-dashboard-ocr-flow.webm"));
console.log(resolve("video/recordings/RemindOCR-dashboard-ocr-flow.webm"));
