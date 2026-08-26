import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");
const shell = await readFile(join(distDir, "index.html"), "utf8");

const pages = [
  {
    path: "",
    title: "RemindOCR - EXTRACT • TRACK • AUTOMATE",
    description:
      "RemindOCR היא מערכת עברית לניהול תסקירי בדיקה, מסמכים, לקוחות ותזכורות עם OCR, חילוץ נתונים אוטומטי וייבוא PDF אופציונלי מ-Gmail.",
    robots: "index,follow",
    body: `
      <main dir="rtl">
        <h1>EXTRACT • TRACK • AUTOMATE</h1>
        <p>RemindOCR מרכזת תסקירי בדיקה, מסמכים, לקוחות ותזכורות לעסקים ישראלים.</p>
        <section>
          <h2>ניהול תסקירים ותזכורות</h2>
          <p>העלאת מסמכים, OCR וחילוץ תאריכים ופרטי לקוח, מעקב תוקף ושליחת תזכורות אוטומטיות.</p>
        </section>
        <section>
          <h2>ייבוא מסמכים חכם</h2>
          <p>תמיכה בקבצי PDF, Word, Excel ותמונות, כולל ייבוא PDF אופציונלי מ-Gmail באישור המשתמש.</p>
        </section>
      </main>
    `,
  },
  {
    path: "pricing",
    title: "מחירים - RemindOCR",
    description:
      "מסלולי RemindOCR לניהול תסקירי בדיקה, חשבוניות, מסמכים ותזכורות אוטומטיות לפי נפח העבודה של העסק.",
    robots: "index,follow",
    body: `
      <main dir="rtl">
        <h1>מחירים - RemindOCR</h1>
        <p>מסלול חינמי לבדיקה, מסלול בסיסי לעבודה חודשית, ומסלול עסקי לנפח מסמכים גבוה.</p>
        <section>
          <h2>מה כלול</h2>
          <p>ייבוא מסמכים, OCR, תזכורות אוטומטיות, ניהול לקוחות ותסקירים, ו-Google Drive במסלולים נתמכים.</p>
        </section>
      </main>
    `,
  },
  {
    path: "privacy",
    title: "מדיניות פרטיות - RemindOCR",
    description:
      "מדיניות הפרטיות של RemindOCR, כולל שימוש במסמכים, חשבונות משתמש וחיבור Gmail אופציונלי לקריאת קבצים מצורפים.",
    robots: "index,follow",
    body: `
      <main dir="rtl">
        <h1>מדיניות פרטיות - RemindOCR</h1>
        <p>מידע על שמירת נתונים, מסמכים, חשבונות משתמש וחיבורי צד שלישי אופציונליים.</p>
      </main>
    `,
  },
  {
    path: "terms",
    title: "תנאי שימוש - RemindOCR",
    description: "תנאי השימוש של RemindOCR לניהול תסקירי בדיקה, מסמכים, לקוחות ותזכורות.",
    robots: "index,follow",
    body: `
      <main dir="rtl">
        <h1>תנאי שימוש - RemindOCR</h1>
        <p>תנאי השימוש במערכת RemindOCR ובשירותי ניהול המסמכים והתזכורות.</p>
      </main>
    `,
  },
  {
    path: "login",
    title: "כניסה - RemindOCR",
    description: "כניסה לחשבון RemindOCR.",
    robots: "noindex,nofollow",
    body: `
      <main dir="rtl">
        <h1>כניסה ל-RemindOCR</h1>
        <p>עמוד כניסה למשתמשים קיימים.</p>
      </main>
    `,
  },
];

function setMetaName(html, name, tag) {
  const pattern = new RegExp(`<meta\\s+name="${name}"[\\s\\S]*?>`, "i");
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n</head>`);
}

function setMetaProperty(html, property, tag) {
  const pattern = new RegExp(`<meta\\s+property="${property}"[\\s\\S]*?>`, "i");
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n</head>`);
}

function setLinkRel(html, rel, tag) {
  const pattern = new RegExp(`<link\\s+rel="${rel}"[\\s\\S]*?>`, "i");
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n</head>`);
}

function jsonLd(page) {
  if (page.path === "pricing") {
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "מה קורה כשמגיעים למכסת המסמכים?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "הייבוא נחסם בצד השרת עד חידוש המכסה או שדרוג מסלול. המסמכים הקיימים נשארים זמינים.",
          },
        },
        {
          "@type": "Question",
          name: "אפשר להתחיל בחינם ולשדרג אחר כך?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "כן. המסלול החינמי מיועד לבדיקה, ואפשר לעבור לבסיסי או עסקי בכל שלב.",
          },
        },
      ],
    };
  }

  if (page.path === "") {
    return {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "RemindOCR",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://remindocr.com/",
      image: "https://remindocr.com/og-image.png",
      inLanguage: "he-IL",
      description: page.description,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "ILS",
        url: "https://remindocr.com/pricing",
      },
    };
  }

  return null;
}

function render(page) {
  const canonical = `https://remindocr.com/${page.path}`;
  let html = shell;
  html = html.replace(/<title>.*?<\/title>/i, `<title>${page.title}</title>`);
  html = setMetaName(html, "description", `<meta name="description" content="${page.description}" />`);
  html = setMetaName(html, "robots", `<meta name="robots" content="${page.robots}" />`);
  html = setLinkRel(html, "canonical", `<link rel="canonical" href="${canonical}" />`);
  html = setMetaProperty(html, "og:url", `<meta property="og:url" content="${canonical}" />`);
  html = setMetaProperty(html, "og:title", `<meta property="og:title" content="${page.title}" />`);
  html = setMetaProperty(html, "og:description", `<meta property="og:description" content="${page.description}" />`);
  html = setMetaName(html, "twitter:url", `<meta name="twitter:url" content="${canonical}" />`);
  html = setMetaName(html, "twitter:title", `<meta name="twitter:title" content="${page.title}" />`);
  html = setMetaName(html, "twitter:description", `<meta name="twitter:description" content="${page.description}" />`);
  const structuredData = jsonLd(page);
  if (structuredData) {
    html = html.replace("</head>", `  <script type="application/ld+json">${JSON.stringify(structuredData)}</script>\n</head>`);
  }
  html = html.replace('<div id="app"></div>', `<div id="app">${page.body}</div>`);
  return html;
}

for (const page of pages) {
  const targetDir = join(distDir, page.path);
  await mkdir(targetDir, {recursive: true});
  await writeFile(join(targetDir, "index.html"), render(page), "utf8");
}
