import {chromium} from "../client/node_modules/@playwright/test/index.mjs";
import {mkdir, readdir, rename} from "node:fs/promises";
import {resolve} from "node:path";

const appUrl = "http://localhost:4173";
const magicUrl = process.env.DEMO_MAGIC_LINK_URL;
const pdfDir = resolve("output/pdf/demo-upload-files");
const rawDir = resolve("output/video/raw");
if (!magicUrl) throw new Error("Set DEMO_MAGIC_LINK_URL before recording.");
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
    const node = document.createElement("div");
    node.id = "demo-caption";
    node.textContent = value;
    Object.assign(node.style, {position: "fixed", top: "22px", left: "50%", transform: "translateX(-50%)", zIndex: "2147483645", padding: "12px 24px", borderRadius: "14px", background: "rgba(20,45,37,.92)", color: "white", font: "700 22px Arial", direction: "rtl"});
    document.body.appendChild(node);
  }, text);
  await pause(ms);
  await page.evaluate(() => document.querySelector("#demo-caption")?.remove());
}

const pdfs = (await readdir(pdfDir)).filter((name) => name.endsWith(".pdf")).sort().map((name) => resolve(pdfDir, name));
if (pdfs.length !== 20) throw new Error(`Expected 20 PDFs, found ${pdfs.length}`);

await page.goto(magicUrl, {waitUntil: "networkidle"});
const onboarding = page.getByRole("dialog").filter({hasText: "ברוכים הבאים ל-RemindOCR"});
if (await onboarding.isVisible().catch(() => false)) {
  await onboarding.getByRole("button", {name: "דלג על ההגדרה"}).click();
  await onboarding.waitFor({state: "hidden"});
}
await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
await caption("העלאה ישירה מהדשבורד", 1200);

await page.locator(".drop-strip").waitFor({state: "visible"});
await page.locator('input.hidden-file-input[type="file"]').setInputFiles(pdfs);
await caption("20 קובצי PDF נשלחו ל-OCR ולחילוץ AI", 1500);
const results = page.getByRole("dialog").filter({hasText: "תוצאות העלאה"});
await results.waitFor({state: "visible", timeout: 10000});
await results.getByText("הושלם", {exact: true}).first().waitFor({state: "visible", timeout: 240000});
await results.getByText("ההעלאה הושלמה", {exact: false}).waitFor({state: "visible", timeout: 240000});
await caption("העיבוד הושלם — לקוחות, תאריכים וסעיפים חולצו", 1500);
await results.getByRole("button", {name: "עבור למסמכים"}).click();
await page.waitForURL(/\/documents/);
await pause(1000);
await caption("מסמכים — פרטי החילוץ זמינים כבר ברשימה", 1400);

const quoteRow = page.locator("tr.document-table-row").filter({hasText: "quote"}).first();
await quoteRow.waitFor({state: "visible", timeout: 20000});
await quoteRow.click();
await page.waitForURL(/\/documents\/[^/]+/, {timeout: 15000});
await caption("מסמך בודד — נתונים שחולצו ב-OCR וב-AI", 1600);

const rawPath = await video.path();
await context.close();
await browser.close();
await rename(rawPath, resolve("output/video/RemindOCR-dashboard-ocr-flow.webm"));
console.log(resolve("output/video/RemindOCR-dashboard-ocr-flow.webm"));
