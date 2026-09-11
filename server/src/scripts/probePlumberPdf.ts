import {existsSync} from "fs";
import {basename, resolve} from "path";
import {parsePdf} from "../pipeline/pdfParser";
import {parsePdfWithPlumber, tablesToText} from "../pipeline/pdfPlumberParser";

const files = process.argv.slice(2).map((p) => resolve(p)).filter((p) => existsSync(p));
if (files.length === 0) {
  console.error("Usage: tsx src/scripts/probePlumberPdf.ts <pdf> [pdf...]");
  process.exit(1);
}

const MARKERS = ["יצרן", "דגם", "סידורי", "רדיוס", "עומס מבחן", "עומס עבודה"];

for (const file of files) {
  console.log(`\n======== ${basename(file)} ========`);
  const plumber = parsePdfWithPlumber(file);
  if (!plumber) {
    console.log("plumber FAILED");
    continue;
  }
  const tableText = tablesToText(plumber.tables);
  const hits = MARKERS.filter((m) => tableText.includes(m));
  console.log(`pages=${plumber.pageCount} tables=${plumber.tables.flat().length} headerHits=${hits.join(",") || "none"}`);
  const rows = tableText.split(/\n+/).filter(Boolean);
  const header = rows.find((r) => r.includes("יצרן") || r.includes("ןרצי"));
  const data = rows.find((r) => /FASSI|HIAB|Man|Palfinger|Versalift|PM|Effer|[A-Z]{2,}\d|\d{4,}/i.test(r) && r.includes("\t"));
  if (header) console.log("header:", header.replace(/\t/g, " │ "));
  if (data) console.log("row:   ", data.replace(/\t/g, " │ ").slice(0, 240));

  const pdf = await parsePdf(file);
  const fused = /סידורי['']?\s*מסדגםיצרן|מסדגםיצרן/.test(pdf.text);
  console.log(`pdf-parse fusedHeader=${fused} chars=${pdf.text.length}`);
}
