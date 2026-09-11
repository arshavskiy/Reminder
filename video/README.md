# הקלטת סרטוני הדגמה

סקריפטי ההקלטה ב-`video/scripts`, התסריטים ב-`video/scenarios`, והתוצרים ב-`video/recordings`.

קבצי ההעלאה הם **10 תסקירי PDF בעברית** מ-`video/assets/demo-upload-files-hebrew`. אין להשתמש ב-`output/pdf/demo-upload-files` (התיקייה לא קיימת). עמוד **חשבוניות** כבוי בפרודקשן — לא מצלמים אותו.

## דרישות

השרת ב-`3737` והלקוח ב-`4173`. חשבון דמו עם פרופיל, לוגו וחתימה. קישור כניסה:

```powershell
cd E:\Projects\Reminder\server
npm run auth:magic-link -- --email=video-onboarding-v1-20260910@example.com
```

## סקריפטים

| פקודה | מה מצלמים |
| --- | --- |
| `npm run video:record-full -- --magic-url="..."` | דמו מלא: העלאה, תסקירים, ציוד (יצרן+דגם), לקוחות, תסקיר+הצעת מחיר, דוח |
| `npm run video:record-inspection -- --magic-url="..."` | תסקיר חדש עם שלוש מכונות, חתימה והצעת מחיר |
| `npm run video:record-pages -- --magic-url="..."` | קליפ קצר לכל מסך + סיור אתר |
| `npm run video:record-ocr --` | העלאה מהדשבורד עד מסמך בודד |

משתני סביבה: `DEMO_MAGIC_LINK_URL`, `DEMO_APP_URL`, `DEMO_TARGET=local|production`.

במצב `production` נדרשות כתובות HTTPS:

```powershell
npm run video:record-full -- --target=production --app-url="https://app.remindocr.com" --magic-url="https://api.remindocr.com/auth/magic?token=TOKEN"
```

## תוצרים

- `video/recordings/RemindOCR-full-product-demo-<date>.webm`
- `video/recordings/RemindOCR-new-inspection-<timestamp>.webm`
- `video/recordings/pages/<date>/` — קליפים לפי מסך
- `video/recordings/raw/` — קבצי Playwright זמניים
