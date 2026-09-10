# הקלטת סרטוני הדגמה

סקריפטי ההקלטה נמצאים ב-`video/scripts`, התסריטים העסקיים ב-`video/scenarios`, והקבצים המוכנים נשמרים ב-`video/recordings`.

## יצירת תסקיר חדש עם חתימה והצעת מחיר

הסקריפט `recordNewInspectionVideo.mjs` נכנס למשתמש דרך קישור קסם, יוצר תסקיר עם שלוש מכונות והצעת מחיר, מציג את המסמך החתום ומוריד את ה-PDF.

### הרצה מקומית

ודאו שהשרת פועל ב-`3737` והלקוח ב-`4173`. צרו קישור כניסה למשתמש:

```powershell
cd E:\Projects\Reminder\server
npm run auth:magic-link -- --email=video-onboarding-v1-20260910@example.com
```

העתיקו את הקישור שהודפס והריצו משורש הפרויקט:

```powershell
cd E:\Projects\Reminder
npm run video:record-inspection -- --target=local --magic-url="http://localhost:3737/auth/magic?token=TOKEN"
```

אפשר להשתמש גם במשתני סביבה:

```powershell
$env:DEMO_TARGET="local"
$env:DEMO_APP_URL="http://localhost:4173"
$env:DEMO_MAGIC_LINK_URL="http://localhost:3737/auth/magic?token=TOKEN"
npm run video:record-inspection
```

### הרצה בפרודקשן

הרצת פרודקשן יוצרת תסקיר אמיתי בחשבון ובמסד הנתונים של פרודקשן. צרו קישור באמצעות הגדרות הפרודקשן של השרת:

```powershell
cd E:\Projects\Reminder\server
$env:SERVER_URL="https://api.remindocr.com"
npm run auth:magic-link -- --production --email=video-onboarding-v1-20260910@example.com
```

לאחר מכן הריצו:

```powershell
cd E:\Projects\Reminder
npm run video:record-inspection -- --target=production --app-url="https://app.remindocr.com" --magic-url="https://api.remindocr.com/auth/magic?token=TOKEN"
```

במצב `production` הסקריפט דורש כתובות HTTPS גם לאפליקציה וגם לקישור הכניסה. כך קישור מקומי לא ייצור בטעות הקלטה חלקית או יפנה למסד נתונים אחר.

## תוצרים

- `video/recordings/RemindOCR-new-inspection-<timestamp>.webm` — סרטון ההקלטה. אפשר לקבוע שם בעזרת `--output=filename.webm`.
- `video/recordings/demo-new-inspection-signed.pdf` — התסקיר שהורד במהלך ההקלטה.
- `video/recordings/raw/` — קובץ Playwright זמני בזמן ההקלטה.

כל הרצה מחליפה את שני קובצי התוצר בעלי השמות הקבועים. כדי לשמור גרסאות קודמות, העתיקו או שנו את שמן לפני ההרצה הבאה.
