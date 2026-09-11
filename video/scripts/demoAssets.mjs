import {readdir} from "node:fs/promises";
import {resolve} from "node:path";

export const DEMO_PDF_DIR = resolve("video/assets/demo-upload-files-hebrew");
export const DEMO_SIGNATURE = resolve("video/assets/demo-signature.png");
export const DEMO_LOGO = resolve("client/src/public/logo-options/option-b-r-mark.png");

/** Magic login must hit the Vite origin so the session cookie is set on :4173. */
export function appMagicUrl(magicUrl, appUrl) {
  const token = new URL(magicUrl).searchParams.get("token");
  if (!token) throw new Error("magic URL is missing token");
  return `${appUrl.replace(/\/$/, "")}/auth/magic?token=${token}`;
}

/** Playwright Chromium often fails cross-origin fetch to :3737; use the Vite proxy. */
export async function patchLocalApiFetch(page) {
  await page.context().addInitScript(() => {
    const rewrite = (value) => {
      if (typeof value === "string") {
        return value.replace(/^https?:\/\/(localhost|127\.0\.0\.1):\d+(?=\/(?:api|auth|ws)\b)/, "");
      }
      if (value instanceof URL && (value.hostname === "localhost" || value.hostname === "127.0.0.1") && /^(api|auth|ws)$/.test(value.pathname.split("/")[1] ?? "")) {
        return `${value.pathname}${value.search}${value.hash}`;
      }
      if (value instanceof Request) {
        const next = rewrite(value.url);
        if (next !== value.url) return new Request(next, value);
      }
      return value;
    };
    const original = window.fetch;
    window.fetch = (input, init) => original.call(window, rewrite(input), init);
  });
}

export async function dismissWalkthrough(page) {
  const overlay = page.locator(".wt-overlay");
  if (!await overlay.isVisible().catch(() => false)) return;
  await page.locator(".wt-tooltip__close").click({timeout: 2000}).catch(() => overlay.click({position: {x: 8, y: 8}}));
  await overlay.waitFor({state: "hidden", timeout: 5000}).catch(() => {});
}

/** Set the session cookie first, then open the app so Vue fetchMe sees a user. */
export async function loginWithMagic(page, magicUrl, appUrl) {
  const origin = appUrl.replace(/\/$/, "");
  if (/localhost|127\.0\.0\.1/.test(origin)) await patchLocalApiFetch(page);
  await page.context().addInitScript(() => {
    localStorage.setItem("walkthrough_completed", JSON.stringify(["main", "documents", "contracts", "reminders", "clients", "reports"]));
  });
  await page.context().request.get(appMagicUrl(magicUrl, origin), {maxRedirects: 5});
  await page.goto(`${origin}/dashboard`, {waitUntil: "domcontentloaded"});
  await page.locator(".appbar__nav, .dash, .drop-strip, .dash__new-contract").first()
    .waitFor({state: "visible", timeout: 20000});
}

export async function listDemoPdfs() {
  const files = (await readdir(DEMO_PDF_DIR))
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort()
    .map((name) => resolve(DEMO_PDF_DIR, name));
  if (!files.length) throw new Error(`No demo PDFs in ${DEMO_PDF_DIR}`);
  return files;
}
