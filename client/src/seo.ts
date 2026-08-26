import type {RouteLocationNormalizedLoaded} from "vue-router";

// The app's own origin. remindocr.com serves the marketing site, so canonical
// and OG tags emitted here must not claim URLs that belong to it.
const SITE_URL = "https://app.remindocr.com";
const SITE_NAME = "RemindOCR";
const DEFAULT_TITLE = "RemindOCR - מערכת ניהול תסקירים ותזכורות";
const DEFAULT_DESCRIPTION =
  "מערכת לניהול תסקירי בדיקה, מסמכים, לקוחות ותזכורות, עם OCR, חילוץ נתונים אוטומטי וייבוא PDF אופציונלי מ-Gmail.";
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

type SeoMeta = {
  title?: string;
  description?: string;
  canonicalPath?: string;
  robots?: string;
};

function upsertMeta(selector: string, attrs: Record<string, string>) {
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  const element = existing ?? document.createElement("meta");

  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value);
  }

  if (!existing) {
    document.head.appendChild(element);
  }
}

function upsertLink(rel: string, href: string) {
  const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  const element = existing ?? document.createElement("link");
  element.setAttribute("rel", rel);
  element.setAttribute("href", href);

  if (!existing) {
    document.head.appendChild(element);
  }
}

function removeJsonLd(id: string) {
  document.getElementById(id)?.remove();
}

function upsertJsonLd(id: string, data: Record<string, unknown>) {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  const element = existing ?? document.createElement("script");
  element.id = id;
  element.type = "application/ld+json";
  element.textContent = JSON.stringify(data);

  if (!existing) {
    document.head.appendChild(element);
  }
}

function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512-v2.png`,
  };
}

export function applySeo(route: RouteLocationNormalizedLoaded) {
  const meta = route.meta as SeoMeta;
  const title = meta.title ?? DEFAULT_TITLE;
  const description = meta.description ?? DEFAULT_DESCRIPTION;
  const canonicalPath = meta.canonicalPath ?? route.path;
  const canonicalUrl = `${SITE_URL}${canonicalPath === "/" ? "/" : canonicalPath}`;
  const robots = meta.robots ?? (meta.canonicalPath ? "index,follow" : "noindex,nofollow");

  document.title = title;

  upsertMeta('meta[name="description"]', {name: "description", content: description});
  upsertMeta('meta[name="robots"]', {name: "robots", content: robots});
  upsertLink("canonical", canonicalUrl);

  upsertMeta('meta[property="og:url"]', {property: "og:url", content: canonicalUrl});
  upsertMeta('meta[property="og:title"]', {property: "og:title", content: title});
  upsertMeta('meta[property="og:description"]', {property: "og:description", content: description});
  upsertMeta('meta[property="og:image"]', {property: "og:image", content: DEFAULT_IMAGE});
  upsertMeta('meta[property="og:image:secure_url"]', {property: "og:image:secure_url", content: DEFAULT_IMAGE});

  upsertMeta('meta[name="twitter:url"]', {name: "twitter:url", content: canonicalUrl});
  upsertMeta('meta[name="twitter:title"]', {name: "twitter:title", content: title});
  upsertMeta('meta[name="twitter:description"]', {name: "twitter:description", content: description});
  upsertMeta('meta[name="twitter:image"]', {name: "twitter:image", content: DEFAULT_IMAGE});

  removeJsonLd("route-seo-jsonld");
  upsertJsonLd("site-organization-jsonld", organizationJsonLd());

  if (canonicalPath === "/") {
    upsertJsonLd("route-seo-jsonld", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      image: DEFAULT_IMAGE,
      inLanguage: "he-IL",
      description,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "ILS",
        url: `${SITE_URL}/pricing`,
      },
    });
  }

  if (canonicalPath === "/pricing") {
    upsertJsonLd("route-seo-jsonld", {
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
        {
          "@type": "Question",
          name: "האם חיבור Gmail חובה?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "לא. אפשר להעלות מסמכים ידנית. Gmail משמש רק לייבוא קבצים מצורפים שתבחרו.",
          },
        },
      ],
    });
  }
}
