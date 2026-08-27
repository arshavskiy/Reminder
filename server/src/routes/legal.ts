import express from "express";
import {existsSync} from "fs";
import {resolve} from "path";

const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>מדיניות פרטיות — RemindOCR</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #2c3e50; line-height: 1.7; }
    h1 { color: #18a058; font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 32px; color: #0d1f4c; }
    p, li { font-size: 15px; }
    .updated { color: #95a5a6; font-size: 13px; margin-bottom: 32px; }
    a { color: #18a058; }
  </style>
</head>
<body>
  <h1>מדיניות פרטיות</h1>
  <p class="updated">עודכן לאחרונה: אוגוסט 2026</p>

  <h2>1. מבוא</h2>
  <p>RemindOCR ("האפליקציה") היא מערכת לניהול תזכורות ותסקירים המיועדת לשימוש עסקי פנימי. אנו מחויבים להגן על פרטיות המשתמשים.</p>

  <h2>2. המידע שאנו אוספים</h2>
  <ul>
    <li>פרטי חשבון Google (שם, כתובת אימייל, תמונת פרופיל) — לצורך אימות בלבד.</li>
    <li>הודעות Gmail — לצורך זיהוי מסמכים מצורפים בלבד, אם המשתמש הסכים לכך במפורש.</li>
    <li>מסמכים שהועלו על-ידי המשתמש — לצורך עיבוד וחילוץ נתונים.</li>
    <li>נתוני לקוחות וחוזים שהוזנו ידנית על-ידי המשתמש.</li>
  </ul>

  <h2>3. כיצד אנו משתמשים במידע</h2>
  <ul>
    <li>אימות זהות המשתמש והרשאת גישה למערכת.</li>
    <li>עיבוד מסמכים וחילוץ שדות באמצעות בינה מלאכותית.</li>
    <li>שליחת תזכורות אוטומטיות ללקוחות.</li>
    <li>לא נמכור, נשכיר או נשתף מידע אישי עם צדדים שלישיים לצורכי שיווק.</li>
  </ul>

  <h2>4. גישה ל-Gmail</h2>
  <p>גישה ל-Gmail מתבצעת אך ורק לאחר הסכמה מפורשת של המשתמש. אנו קוראים אימיילים לצורך זיהוי קבצים מצורפים רלוונטיים בלבד. איננו מאחסנים תוכן אימיילים מעבר לנדרש לעיבוד הבקשה.</p>

  <h2>5. אבטחת מידע</h2>
  <p>המידע מאוחסן בשרתים מאובטחים. אנו משתמשים בהצפנה (HTTPS) לכל התקשורת. גישה למידע מוגבלת לעובדים המורשים בלבד.</p>

  <h2>6. שמירת מידע</h2>
  <p>המידע נשמר כל עוד החשבון פעיל. ניתן לבקש מחיקת מידע בפנייה אלינו.</p>

  <h2>7. יצירת קשר</h2>
  <p>לשאלות בנוגע למדיניות הפרטיות: <a href="mailto:arshavsky.pasha@gmail.com">arshavsky.pasha@gmail.com</a></p>
</body>
</html>`;

const TERMS_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>תנאי שימוש — RemindOCR</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #2c3e50; line-height: 1.7; }
    h1 { color: #18a058; font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 32px; color: #0d1f4c; }
    p, li { font-size: 15px; }
    .updated { color: #95a5a6; font-size: 13px; margin-bottom: 32px; }
    a { color: #18a058; }
  </style>
</head>
<body>
  <h1>תנאי שימוש</h1>
  <p class="updated">עודכן לאחרונה: אוגוסט 2026</p>

  <h2>1. קבלת התנאים</h2>
  <p>השימוש במערכת RemindOCR מהווה הסכמה לתנאי שימוש אלו. אם אינך מסכים לתנאים, אנא הפסק את השימוש באפליקציה.</p>

  <h2>2. תיאור השירות</h2>
  <p>RemindOCR היא מערכת לניהול תזכורות, תסקירים וחוזים. המערכת מאפשרת העלאת מסמכים, חילוץ נתונים אוטומטי ושליחת תזכורות ללקוחות.</p>

  <h2>3. שימוש מותר</h2>
  <ul>
    <li>השימוש מותר לצרכים עסקיים לגיטימיים בלבד.</li>
    <li>אין להשתמש במערכת לפעילות בלתי חוקית.</li>
    <li>אין לנסות לפרוץ, לעקוף, או לגשת לנתוני משתמשים אחרים.</li>
  </ul>

  <h2>4. קניין רוחני</h2>
  <p>כל הזכויות במערכת, כולל קוד, עיצוב ותכנים, שמורות לבעלי המערכת. אין להעתיק או להפיץ ללא אישור.</p>

  <h2>5. הגבלת אחריות</h2>
  <p>המערכת מסופקת "כפי שהיא". איננו אחראים לנזקים שנגרמו כתוצאה משימוש במערכת, כולל אובדן נתונים או הפרעות בשירות.</p>

  <h2>6. שינויים בתנאים</h2>
  <p>אנו שומרים את הזכות לעדכן תנאים אלו בכל עת. המשך השימוש לאחר שינוי מהווה הסכמה לתנאים המעודכנים.</p>

  <h2>7. יצירת קשר</h2>
  <p>לשאלות בנוגע לתנאי השימוש: <a href="mailto:arshavsky.pasha@gmail.com">arshavsky.pasha@gmail.com</a></p>
</body>
</html>`;

const ACCESSIBILITY_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>נגישות — RemindOCR</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #2c3e50; line-height: 1.7; }
    h1 { color: #18a058; font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 32px; color: #0d1f4c; }
    p, li { font-size: 15px; }
    .updated { color: #95a5a6; font-size: 13px; margin-bottom: 32px; }
    a { color: #18a058; }
  </style>
</head>
<body>
  <h1>הצהרת נגישות</h1>
  <p class="updated">עודכן לאחרונה: אוגוסט 2026</p>
  <p>RemindOCR פועלת לשפר את נגישות האתר והאפליקציה למשתמשים עם מוגבלויות.</p>
  <h2>יצירת קשר</h2>
  <p>לדיווח על בעיית נגישות: <a href="mailto:arshavsky.pasha@gmail.com">arshavsky.pasha@gmail.com</a></p>
</body>
</html>`;

const SECURITY_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>אבטחת מידע — RemindOCR</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #2c3e50; line-height: 1.7; }
    h1 { color: #18a058; font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 32px; color: #0d1f4c; }
    p, li { font-size: 15px; }
    .updated { color: #95a5a6; font-size: 13px; margin-bottom: 32px; }
    a { color: #18a058; }
  </style>
</head>
<body>
  <h1>אבטחת מידע</h1>
  <p class="updated">עודכן לאחרונה: אוגוסט 2026</p>
  <p>RemindOCR משתמשת ב־HTTPS, אחסון מאובטח ובקרת גישה לפי תפקיד כדי להגן על המידע שלכם.</p>
  <h2>יצירת קשר</h2>
  <p>לשאלות אבטחה: <a href="mailto:arshavsky.pasha@gmail.com">arshavsky.pasha@gmail.com</a></p>
</body>
</html>`;

export function registerLegalRoutes(app: express.Application) {
  app.get(["/privacy", "/privacy.html"], (_req, res) => {
    sendLandingHtml(res, "privacy.html", PRIVACY_HTML);
  });

  app.get(["/terms", "/terms.html"], (_req, res) => {
    sendLandingHtml(res, "terms.html", TERMS_HTML);
  });

  app.get(["/accessibility", "/accessibility.html"], (_req, res) => {
    sendLandingHtml(res, "accessibility.html", ACCESSIBILITY_HTML);
  });

  app.get(["/security", "/security.html"], (_req, res) => {
    sendLandingHtml(res, "security.html", SECURITY_HTML);
  });
}

function sendLandingHtml(res: express.Response, fileName: string, fallbackHtml: string) {
  const filePath = findLandingFile(fileName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (filePath) {
    res.sendFile(filePath);
    return;
  }
  res.send(fallbackHtml);
}

function findLandingFile(fileName: string): string | null {
  const candidates = [
    resolve(process.cwd(), "../landing", fileName),
    resolve(process.cwd(), "landing", fileName),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
