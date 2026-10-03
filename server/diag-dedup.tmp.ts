import "./src/scripts/loadEnv";
import {connectDb, col, closeDb} from "./src/db/db";
import {toPairRow, scorePair, hasActivePair} from "./src/invoices/pairing";
import {invoiceDocumentCategory} from "./src/invoices/documentCategory";

await connectDb();
const rows = await col<any>("invoices").find({} as any, {projection: {preview_html: 0, items: 0}} as any).toArray();
const cats = new Map<string, number>();
for (const r of rows) {
    const k = invoiceDocumentCategory(r.document_subtype ?? r.template_name ?? r.fields?.document_subtype);
    cats.set(k, (cats.get(k) ?? 0) + 1);
}
console.log("rows now:", rows.length, Object.fromEntries(cats));
const subtypes = new Map<string, number>();
for (const r of rows) {
    const s = String(r.document_subtype ?? "-");
    subtypes.set(s, (subtypes.get(s) ?? 0) + 1);
}
console.log("top subtypes:", [...subtypes].sort((a, b) => b[1] - a[1]).slice(0, 12));
const pr = rows.map((r: any) => toPairRow(r));
const paired = pr.filter((r) => hasActivePair(r));
console.log("rows with an active invoice<->receipt pair:", paired.length);
const inv = pr.filter((r) => r.role === "invoice" && !hasActivePair(r));
const rec = pr.filter((r) => r.role === "receipt" && !hasActivePair(r));
let pairable = 0;
for (const i of inv) if (rec.some((r) => scorePair(i, r))) pairable += 1;
console.log("unpaired invoices that have a matching receipt:", pairable, "of", inv.length);
await closeDb();
