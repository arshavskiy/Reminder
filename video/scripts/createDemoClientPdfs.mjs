import {chromium} from "../../client/node_modules/@playwright/test/index.mjs";
import {mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {DEMO_PDF_DIR} from "./demoAssets.mjs";

const reports = [
  {
    file: "inspection-hebrew-11.pdf",
    number: "48192/3101",
    company: "כרמל אחסנה בע״מ",
    companyId: "514812345",
    contact: "נועה לוי",
    phone: "04-8421101",
    mobile: "052-1945001",
    email: "office@carmel-storage.co.il",
    address: "התעשייה 12",
    city: "חיפה",
    site: "מחסן כרמל, חיפה",
    license: "GL-2026-01",
    equipmentName: "מלגזה דיזל",
    rows: [
      ["מלגזה דיזל 2.5 טון", "Toyota", "8FD25", "SH-25001", "0.50", "3125", "2500"],
      ["עגלת משטחים חשמלית", "BT", "LPE200", "SH-20011", "0.40", "2500", "2000"],
    ],
  },
  {
    file: "inspection-hebrew-12.pdf",
    number: "48192/3102",
    company: "כרמל אחסנה בע״מ",
    companyId: "514812345",
    contact: "נועה לוי",
    phone: "04-8421101",
    mobile: "052-1945001",
    email: "office@carmel-storage.co.il",
    address: "התעשייה 12",
    city: "חיפה",
    site: "רציף המכולות, נמל חיפה",
    license: "GL-2026-02",
    equipmentName: "במת הרמה",
    rows: [
      ["במת הרמה מספריים", "Haulotte", "Compact 12", "SH-12008", "0.60", "450", "320"],
    ],
  },
  {
    file: "inspection-hebrew-13.pdf",
    number: "48192/3201",
    company: "מנוף העמק בע״מ",
    companyId: "515667890",
    contact: "יואב מזרחי",
    phone: "04-6562200",
    mobile: "054-3201108",
    email: "office@manof-haemek.co.il",
    address: "העמק 8",
    city: "עפולה",
    site: "אתר בנייה מנוף העמק, עפולה",
    license: "MH-2026-01",
    equipmentName: "עגורן נייד",
    rows: [
      ["עגורן נייד 25 טון", "Liebherr", "LTM 1025", "MH-102501", "18.00", "25000", "20000"],
      ["מתקן הרמה נגרר", "Manitou", "MT 625", "MH-62509", "3.40", "3125", "2500"],
    ],
  },
  {
    file: "inspection-hebrew-14.pdf",
    number: "48192/3202",
    company: "מנוף העמק בע״מ",
    companyId: "515667890",
    contact: "יואב מזרחי",
    phone: "04-6562200",
    mobile: "054-3201108",
    email: "office@manof-haemek.co.il",
    address: "העמק 8",
    city: "עפולה",
    site: "מגרש ציוד, עפולה",
    license: "MH-2026-02",
    equipmentName: "מלגזה שטח",
    rows: [
      ["מלגזה שטח 3 טון", "Manitou", "M 30-4", "MH-30044", "0.60", "3750", "3000"],
    ],
  },
];

const isolate = (value) => `\u200E${value}\u200E`;

function pageHtml(report) {
  const equipmentRows = report.rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <style>
    @page { size: A4; margin: 16mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #1c1c1c; font-size: 13px; line-height: 1.45; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    .meta { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
    .label { color: #555; display: block; }
    .value { unicode-bidi: isolate; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #222; padding: 6px 8px; text-align: right; }
    th { background: #f3f3f3; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
    .value { display: block; white-space: nowrap; font-size: 16px; }
  </style>
</head>
<body>
  <div class="meta">
    <div><span class="label">תאריך בדיקה:</span> 2026-09-18</div>
    <div><span class="label">בתוקף עד:</span> 2027-03-18</div>
  </div>
  <h1>תסקיר ניסוי ובדיקה של מכונת הרמה</h1>
  <p>פקודת הבטיחות בעבודה (נוסח חדש), תש״ל-1970, סעיפים 81 ו-86</p>
  <p><span class="label">מספר תסקיר בדיקה:</span> ${report.number}</p>
  <h2>1. פרטי הלקוח/תופש</h2>
  <div class="grid">
    <div><span class="label">שם הלקוח/תופש</span><span class="value">${isolate(report.company)}</span></div>
    <div><span class="label">ח.פ</span><span class="value">${report.companyId}</span></div>
    <div><span class="label">כתובת</span><span class="value">${report.address}</span></div>
    <div><span class="label">יישוב</span><span class="value">${report.city}</span></div>
    <div><span class="label">איש קשר</span><span class="value">${isolate(report.contact)}</span></div>
    <div><span class="label">טלפון</span><span class="value">${report.phone}</span></div>
    <div><span class="label">נייד</span><span class="value">${report.mobile}</span></div>
    <div><span class="label">מייל</span><span class="value">${report.email}</span></div>
    <div><span class="label">מספר רישוי</span><span class="value">${report.license}</span></div>
    <div><span class="label">מקום הבדיקה</span><span class="value">${report.site}</span></div>
  </div>
  <h2>2. תיאור מכונת הרמה</h2>
  <p><span class="label">שם הציוד:</span> ${report.equipmentName}</p>
  <table>
    <thead>
      <tr>
        <th>תיאור</th><th>יצרן</th><th>דגם</th><th>מס׳ סידורי</th>
        <th>רדיוס עומס (מטר)</th><th>עומס מבחן (ק״ג)</th><th>עומס עבודה בטוח (ק״ג)</th>
      </tr>
    </thead>
    <tbody>${equipmentRows}</tbody>
  </table>
  <h2>3. תיאור ליקויים, השיפורים, ואמצעים לתיקונים</h2>
  <p>כללי: אין</p>
  <p>התסקיר נערך בהתאם לפקודת הבטיחות בעבודה. הבדיקה מתייחסת למצב הציוד ביום הבדיקה.</p>
  <p>אני דניאל כהן, בעל תעודה מס׳ 48192, מאשר כי בדקתי את הציוד המתואר בתסקיר.</p>
  <p>חתימת הבודק: דניאל כהן · אופק בדיקות והנדסה · ח.פ 515555555</p>
</body>
</html>`;
}

await mkdir(DEMO_PDF_DIR, {recursive: true});
const browser = await chromium.launch({headless: true});
const page = await browser.newPage();
for (const report of reports) {
  await page.setContent(pageHtml(report), {waitUntil: "load"});
  const path = resolve(DEMO_PDF_DIR, report.file);
  await page.pdf({path, format: "A4", printBackground: true});
  console.log(`${report.file} ${report.company}`);
}
await browser.close();
