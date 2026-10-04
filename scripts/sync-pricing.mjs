import {readFile, writeFile} from "node:fs/promises";
import {renderPricing} from "../landing/assets/pricing.mjs";

const source = await readFile(new URL("../client/src/shared/pricingCatalog.json", import.meta.url), "utf8");
const catalog = JSON.parse(source);
const check = process.argv.includes("--check");
const publishedCatalog = new URL("../landing/assets/pricing-catalog.json", import.meta.url);
if (check) {
  if (await readFile(publishedCatalog, "utf8") !== source) {
    throw new Error("Landing catalog is stale. Run npm run pricing:sync.");
  }
} else {
  await writeFile(publishedCatalog, source, "utf8");
}
for (const locale of ["he", "en", "ru"]) {
  for (const page of ["pricing.html", "index.html"]) {
    const path = new URL(`../landing/${locale === "he" ? "" : `${locale}/`}${page}`, import.meta.url);
    const html = await readFile(path, "utf8");
    // The English landing page links to the full catalog rather than embedding plan cards.
    if (locale !== "he" && page === "index.html" && html.includes("data-pricing-summary")) continue;
    const marker = /<!-- pricing:start -->[\s\S]*?<!-- pricing:end -->/;
    if (!marker.test(html)) throw new Error(`Missing pricing markers: ${path}`);
    const updated = html.replace(marker, () => `<!-- pricing:start -->\n${renderPricing(catalog, locale, page === "index.html" ? "h3" : "h2")}\n<!-- pricing:end -->`);
    if (updated === html) continue;
    if (check) throw new Error(`Pricing snapshot is stale (${locale}/${page}). Run npm run pricing:sync.`);
    await writeFile(path, updated, "utf8");
  }
}
console.log(check ? "Pricing snapshots match the catalog." : "Pricing snapshots updated.");
