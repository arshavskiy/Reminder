import type {RouteLocationNormalizedLoaded} from "vue-router";

const DEFAULT_TITLE = "RemindOCR - מערכת ניהול תסקירים ותזכורות";

type SeoMeta = {
  title?: string;
};

/**
 * Sets the browser tab title for the current route.
 *
 * This used to also write canonical, Open Graph, Twitter and JSON-LD tags. That
 * became pointless once the marketing site moved to remindocr.com: this app is
 * served from app.remindocr.com, which sits behind sign-in and is disallowed in
 * robots.txt, so no crawler reads those tags and a shared link only ever shows
 * a sign-in wall. The landing site carries that metadata for the pages people
 * actually find in search.
 *
 * The title is different — it is chrome the signed-in user sees on every route.
 */
export function applySeo(route: RouteLocationNormalizedLoaded) {
  const meta = route.meta as SeoMeta;
  document.title = meta.title ?? DEFAULT_TITLE;
}
