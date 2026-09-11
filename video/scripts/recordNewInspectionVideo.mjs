import {chromium} from "../../client/node_modules/@playwright/test/index.mjs";
import {mkdir, rename} from "node:fs/promises";
import {resolve} from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, "").split("=");
  return [key, rest.join("=") || "true"];
}));
const target = args.target || process.env.DEMO_TARGET || "local";
const appUrl = (args["app-url"] || process.env.DEMO_APP_URL || (target === "production" ? "https://app.remindocr.com" : "http://localhost:4173")).replace(/\/$/, "");
const magicUrl = args["magic-url"] || process.env.DEMO_MAGIC_LINK_URL;
if (!magicUrl) throw new Error("Set DEMO_MAGIC_LINK_URL before recording.");
if (target === "production" && (!appUrl.startsWith("https://") || !magicUrl.startsWith("https://"))) {
  throw new Error("Production recording requires HTTPS --app-url and --magic-url values.");
}

const outputDir = resolve("video/recordings");
const rawDir = resolve(outputDir, "raw");
const outputName = args.output || `RemindOCR-new-inspection-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
const pdfOutput = args["pdf-output"] || "demo-new-inspection-signed.pdf";
await mkdir(rawDir, {recursive: true});

const browser = await chromium.launch({headless: true});
const context = await browser.newContext({
  viewport: {width: 1440, height: 900},
  recordVideo: {dir: rawDir, size: {width: 1440, height: 900}},
  acceptDownloads: true,
});
await context.addInitScript(() => {
  localStorage.setItem("walkthrough_completed", JSON.stringify(["main", "documents"]));
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
    Object.assign(el.style, {position: "fixed", top: "22px", left: "50%", transform: "translateX(-50%)", zIndex: "2147483645", padding: "12px 24px", borderRadius: "14px", background: "rgba(20,45,37,.92)", color: "white", font: "700 22px Arial", direction: "rtl", boxShadow: "0 10px 30px rgba(0,0,0,.22)"});
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

try {
  await page.goto(magicUrl, {waitUntil: "networkidle"});
  await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
  await pause(800);
  await caption("יצירת תסקיר חדש ב־RemindOCR", 1500);
  await page.getByRole("button", {name: /תסקיר חדש/}).click();
  await dialog().waitFor({state: "visible"});

  const reportNumber = field("מספר תסקיר").locator("input");
  if (!await reportNumber.inputValue()) await reportNumber.fill(`VID-${Date.now().toString().slice(-6)}`);
  const dates = dialog().getByPlaceholder("בחר תאריך");
  await dates.first().fill("2026-09-10");
  await dates.first().press("Enter");
  await chooseSelection(field("מרווח בדיקות").locator(".n-base-selection"), "6 חודשים");
  await field("מקום הבדיקה").locator("input").fill("מרכז לוגיסטי אופק, תל אביב");
  await caption("פרטי התסקיר ומועד הבדיקה הבאה", 1100);
  await dialog().getByRole("button", {name: "הבא"}).click();

  await field("שם העסק").locator("input").fill("אופק לוגיסטיקה בע״מ");
  await field("ח.פ / ת.ז").locator("input").fill("515556666");
  await field("איש קשר").locator("input").fill("רוני לוי");
  await field("טלפון").locator("input").fill("03-5552026");
  await field("נייד").locator("input").fill("050-5552026");
  await field("אימייל").locator("input").fill("office@ofek-logistics.co.il");
  await field("כתובת").locator("input").fill("המסגר 18");
  await field("יישוב").locator("input").fill("תל אביב");
  await caption("פרטי הלקוח נשמרים אוטומטית", 1000);
  await dialog().getByRole("button", {name: "הבא"}).click();

  const addDynamicValue = async (row, label, _placeholder, value) => {
    const dynamicField = row.locator(".hm-field")
      .filter({has: page.locator("label").filter({hasText: new RegExp(`^${label}`)})});
    const existingTags = dynamicField.locator(".n-tag__close");
    while (await existingTags.count()) await existingTags.first().click();
    const input = dynamicField.getByRole("textbox");
    if (!await input.isVisible().catch(() => false)) await dynamicField.getByRole("button").last().click();
    await input.waitFor({state: "visible"});
    await input.fill(value);
    await input.press("Enter");
  };
  const fillEquipment = async (index, equipment) => {
    const row = dialog().locator(".hm-equipment").nth(index);
    await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "שם הציוד"})}).locator("input").fill(equipment.name);
    await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "יצרן"})}).locator("input").fill(equipment.manufacturer);
    await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "מספר רישוי"})}).locator("input").fill(equipment.license);
    await addDynamicValue(row, "דגם", "הוסף דגם", equipment.model);
    await addDynamicValue(row, "מס׳ סידורי", "הוסף מספר סידורי", equipment.serial);
    await addDynamicValue(row, "עומס עבודה בטוח", "הוסף עומס", equipment.workLoad);
    await addDynamicValue(row, "עומס מבחן", "הוסף עומס", equipment.testLoad);
    await addDynamicValue(row, "רדיוס עומס", "הוסף רדיוס", equipment.radius);
    await row.locator(".hm-field").filter({has: page.locator("label", {hasText: "תיאור ציוד"})}).locator("textarea").fill(equipment.description);
  };
  await fillEquipment(0, {
    name: "מלגזה חשמלית 1", manufacturer: "Toyota", license: "FL-2026-01",
    model: "8FBEKT16", serial: "TY-16001", workLoad: "1600", testLoad: "2000", radius: "0.50",
    description: "מלגזה חשמלית תלת גלגלית, תורן דו שלבי",
  });
  await dialog().getByRole("button", {name: "הוסף מכונה"}).click();
  await fillEquipment(1, {
    name: "מלגזה חשמלית 2", manufacturer: "Toyota", license: "FL-2026-02",
    model: "8FBET18", serial: "TY-18002", workLoad: "1800", testLoad: "2250", radius: "0.50",
    description: "מלגזה חשמלית ארבע גלגלית, תורן תלת שלבי",
  });
  await dialog().getByRole("button", {name: "הוסף מכונה"}).click();
  await fillEquipment(2, {
    name: "במת הרמה", manufacturer: "Genie", license: "PL-2026-03",
    model: "GS-1932", serial: "GN-193203", workLoad: "227", testLoad: "284", radius: "0",
    description: "במת הרמה מספריים חשמלית לעבודה בגובה",
  });
  await caption("שלוש מכונות בתסקיר אחד", 1300);
  await dialog().getByRole("button", {name: "הבא"}).click();
  await dialog().getByRole("button", {name: "הבא"}).click();

  await chooseSelection(field("מסמך שיופק עם התסקיר").locator(".n-base-selection"), "הצעת מחיר");
  await field("בתוקף / לתשלום עד").locator("input").fill("2026-10-10");
  for (let index = 0; index < 4; index++) await dialog().getByRole("button", {name: "הוספת סעיף"}).click();
  const services = [
    ["בדיקת מלגזה", "בדיקה תקופתית למלגזה חשמלית", "850"],
    ["בדיקת במת הרמה", "בדיקה תקופתית לבמת הרמה", "950"],
    ["הפקת תסקיר", "הפקת תסקיר חתום ושליחה ללקוח", "320"],
    ["תזכורת תקופתית", "הקמת תזכורת אוטומטית לבדיקה הבאה", "180"],
  ];
  const lines = dialog().locator(".hm-billing-line");
  const lineCount = await lines.count();
  for (let index = 0; index < lineCount; index++) {
    const row = lines.nth(index);
    const service = services[index % services.length];
    await row.getByRole("checkbox").check();
    await row.getByLabel("סעיף בדיקה").locator("input").fill(service[0]);
    await row.getByLabel("תיאור השירות").locator("input").fill(service[1]);
    await row.getByLabel("מחיר יחידה").locator("input").fill(service[2]);
  }
  await caption("הצעת מחיר עם מספר סעיפי שירות", 1400);
  await dialog().getByRole("button", {name: "שמור ופתח תצוגה"}).click();
  await page.waitForURL(/print-templates\/layout/, {timeout: 30000});
  await pause(1800);
  await caption("התסקיר נוצר עם הלוגו והחתימה השמורים בפרופיל", 2200);

  // savePdf builds the file client-side and triggers a synthetic <a download>
  // on a blob: URL, which Playwright does not always surface as a "download"
  // event. Treat the saved PDF as a nice-to-have: the recording is the point,
  // so a missed download must not abort a run that has otherwise succeeded.
  const downloadPromise = page.waitForEvent("download", {timeout: 15000}).catch(() => null);
  await page.getByRole("button", {name: /הורד PDF/}).click();
  const download = await downloadPromise;
  if (download) {
      await download.saveAs(resolve(outputDir, pdfOutput));
    await caption("המסמך החתום הורד כ־PDF", 1400);
  } else {
    console.warn("[record] PDF download event not observed; continuing without saving the file.");
    await caption("המסמך החתום מוכן להורדה", 1400);
  }

  const rawPath = await video.path();
  await context.close();
  await browser.close();
  await rename(rawPath, resolve(outputDir, outputName));
  console.log(resolve(outputDir, outputName));
} catch (error) {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  throw error;
}
