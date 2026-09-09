export interface InspectionRate { id: string; reportType: string; section: string; label: string; unitCents: number }
export interface ChargeLine { rateId: string; section: string; label: string; quantity: number; unitCents: number; totalCents: number }

export type BillingDocumentKind = "quote" | "payment_request" | "service_specification";

export const BILLING_DOCUMENT_LABELS: Record<BillingDocumentKind, string> = {
  quote: "הצעת מחיר",
  payment_request: "דרישת תשלום",
  service_specification: "מפרט תשלום עבור שירות",
};

export function formatBillingDocumentNumber(kind: BillingDocumentKind, counter: number, year: number): string {
  if (!Number.isSafeInteger(counter) || counter < 1) throw new Error("מונה מסמך לא תקין");
  if (kind === "quote") return String(counter).padStart(3, "0");
  const prefix = kind === "service_specification" ? "SPEC" : "PAY";
  return `${prefix}-${year}-${String(counter).padStart(5, "0")}`;
}

export function validateRates(input: unknown): InspectionRate[] {
  if (!Array.isArray(input) || input.length > 300) throw new Error("מחירון לא תקין");
  const seen = new Set<string>();
  return input.map(raw => {
    if (!raw || typeof raw.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(raw.id) || seen.has(raw.id)) throw new Error("מזהה סעיף לא תקין או כפול");
    seen.add(raw.id);
    for (const key of ["reportType", "section", "label"]) {
      if (typeof raw[key] !== "string" || !raw[key].trim() || raw[key].length > 200) throw new Error("יש למלא סוג תסקיר, סעיף ותיאור");
    }
    if (!Number.isSafeInteger(raw.unitCents) || raw.unitCents < 0 || raw.unitCents > 100000000) throw new Error("מחיר לא תקין");
    return {id: raw.id, reportType: raw.reportType.trim(), section: raw.section.trim(), label: raw.label.trim(), unitCents: raw.unitCents};
  });
}

export function calculateCharges(rates: InspectionRate[], reportType: string, selections: unknown, vatBasisPoints: unknown) {
  if (!Array.isArray(selections) || !selections.length || selections.length > 100) throw new Error("יש לבחור לפחות סעיף חיוב אחד");
  if (!Number.isSafeInteger(vatBasisPoints) || Number(vatBasisPoints) < 0 || Number(vatBasisPoints) > 10000) throw new Error("שיעור מס לא תקין");
  const seen = new Set<string>();
  const lines: ChargeLine[] = selections.map(selection => {
    const rate = rates.find(item => item.id === selection?.rateId && item.reportType === reportType);
    if (!rate || seen.has(rate.id)) throw new Error("סעיף לא קיים, כפול או לא מתאים לסוג התסקיר");
    seen.add(rate.id);
    if (!Number.isSafeInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > 10000) throw new Error("כמות לא תקינה");
    return {rateId: rate.id, section: rate.section, label: rate.label, quantity: selection.quantity, unitCents: rate.unitCents, totalCents: rate.unitCents * selection.quantity};
  });
  const subtotalCents = lines.reduce((sum, item) => sum + item.totalCents, 0);
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 1000000000) throw new Error("סכום דרישה גבוה מדי");
  const vatCents = Math.round(subtotalCents * Number(vatBasisPoints) / 10000);
  return {lines, subtotalCents, vatBasisPoints: Number(vatBasisPoints), vatCents, totalCents: subtotalCents + vatCents, currency: "ILS"};
}

export const escapePaymentHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char]!));

function safeImageUrl(value: unknown): string {
  const url = String(value ?? "").trim();
  return /^(https?:\/\/|data:image\/(?:png|jpe?g|webp);base64,)/i.test(url) ? escapePaymentHtml(url) : "";
}

export function renderPaymentRequestHtml(request: any): string {
  const e = escapePaymentHtml;
  const amount = (cents: number) => (cents / 100).toLocaleString("he-IL", {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const kind = request.documentKind as BillingDocumentKind;
  const title = BILLING_DOCUMENT_LABELS[kind] ?? BILLING_DOCUMENT_LABELS.payment_request;
  const createdDate = new Date(request.createdAt);
  const formattedDate = Number.isNaN(createdDate.getTime())
    ? ""
    : createdDate.toLocaleDateString("he-IL", {day: "2-digit", month: "2-digit", year: "numeric"});
  const logoUrl = safeImageUrl(request.issuer?.logoUrl);
  const issuerContact = [request.issuer?.phone, request.issuer?.email].filter(Boolean).map(e).join(" · ");
  const issuerLocation = [request.issuer?.address, request.issuer?.registration ? `ח.פ./ע.מ. ${request.issuer.registration}` : ""]
    .filter(Boolean).map(e).join(" · ");
  const rows = (request.lines || []).map((line: ChargeLine) => `<tr>
    <td class="section">${e(line.section)}</td>
    <td><strong>${e(line.label)}</strong></td>
    <td class="numeric">${line.quantity}</td>
    <td class="numeric">${amount(line.unitCents)} ₪</td>
    <td class="numeric total-cell">${amount(line.totalCents)} ₪</td>
  </tr>`).join("");
  const footer = kind === "quote"
    ? "מסמך זה הוא הצעת מחיר ואינו חשבונית מס או קבלה."
    : kind === "service_specification"
      ? "מסמך זה הוא מפרט תשלום עבור שירות ואינו חשבונית מס או קבלה."
      : "מסמך זה הוא דרישת תשלום ואינו חשבונית מס או קבלה.";
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  @page{size:A4;margin:16mm 17mm 15mm}*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{margin:0;font-family:Arial,"Segoe UI",sans-serif;color:#20352e;font-size:12px;line-height:1.55;background:#fff}
  .header{display:grid;grid-template-columns:1.12fr .88fr;gap:30px;min-height:128px;align-items:center;padding-bottom:18px;border-bottom:1px solid #809089}
  .brand{display:flex;align-items:center;justify-content:center;min-height:108px}.brand-logo{width:220px;height:125px;object-fit:contain}
  .issuer{text-align:left;direction:rtl}.issuer h2{margin:0 0 4px;font-size:17px;color:#173f32}.issuer .subtitle{font-weight:700;color:#49645b}.issuer div{margin-top:2px;color:#64756f}
  .overview{display:grid;grid-template-columns:1.05fr 1.35fr;gap:30px;margin-top:20px;align-items:start}.customer{padding:8px 0;text-align:right}.eyebrow{font-size:10px;font-weight:700;color:#6c8078;letter-spacing:.04em}.customer strong{display:block;margin:2px 0 7px;font-size:15px;color:#1c342c}.customer div{margin-top:2px;color:#63756e}
  .summary-cards{display:grid;grid-template-columns:1fr 1fr;border:1px solid #ccd8d3}.summary-card{padding:10px 13px;text-align:center}.summary-card+.summary-card{border-right:1px solid #ccd8d3}.summary-card.total{background:#16875d;color:#fff}.summary-card .label{display:block;font-size:9px;font-weight:700;margin-bottom:2px;opacity:.8}.summary-card strong{font-size:15px}
  .title-block{margin:27px 0 20px}.title-block h1{margin:0;color:#102c23;font-size:27px;line-height:1.2}.title-block .reference{margin-top:4px;color:#6a7d75}.title-block .subject{margin-top:19px;font-size:13px;font-weight:700;color:#263f37}
  table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th{padding:9px 7px;border-bottom:2px solid #1f4538;color:#24453a;text-align:right;font-size:10px}td{padding:10px 7px;border-bottom:1px solid #d7e0dc;vertical-align:top}th:nth-child(1),td:nth-child(1){width:11%}th:nth-child(3),td:nth-child(3){width:11%}th:nth-child(4),td:nth-child(4),th:nth-child(5),td:nth-child(5){width:17%}.section{color:#61756d}.numeric{direction:ltr;text-align:right;white-space:nowrap}.total-cell{font-weight:700;color:#173f32}
  .after-table{display:grid;grid-template-columns:1fr 245px;gap:34px;margin-top:18px;align-items:start}.totals{border-top:2px solid #1f4538}.total-row{display:flex;justify-content:space-between;padding:7px 4px;border-bottom:1px solid #d7e0dc}.total-row.grand{padding-top:11px;color:#16875d;font-size:15px;font-weight:800;border-bottom:2px solid #16875d}
  .signature{margin-top:38px;width:210px}.signature-line{height:34px;border-bottom:1px solid #61756d}.signature-label{padding-top:5px;color:#71827c;font-size:10px}.document-note{margin-top:30px;padding-top:10px;border-top:1px solid #cdd8d3;color:#667a72;font-size:10px}
  footer{display:flex;justify-content:space-between;align-items:center;margin-top:24px;color:#798a84;font-size:8px;border-top:1px solid #d8e0dd;padding-top:6px}.footer-credit{display:flex;align-items:center;gap:4px}.footer-credit strong{color:#16875d}.footer-credit .studio{color:#425b52;font-weight:700}
</style>
</head>
<body>
  <header class="header">
    <div class="brand">${logoUrl ? `<img class="brand-logo" src="${logoUrl}" alt="לוגו העסק">` : ""}</div>
    <div class="issuer">
      <h2>${e(request.issuer?.name)}</h2>
      ${request.issuer?.subtitle ? `<div class="subtitle">${e(request.issuer.subtitle)}</div>` : ""}
      ${issuerLocation ? `<div>${issuerLocation}</div>` : ""}
      ${issuerContact ? `<div>${issuerContact}</div>` : ""}
    </div>
  </header>

  <section class="overview">
    <div class="customer">
      <span class="eyebrow">לכבוד</span>
      <strong>${e(request.customer?.name)}</strong>
      ${request.customer?.registration ? `<div>ח.פ./ע.מ. ${e(request.customer.registration)}</div>` : ""}
      ${request.customer?.email ? `<div>${e(request.customer.email)}</div>` : ""}
    </div>
    <div class="summary-cards">
      <div class="summary-card total"><span class="label">סה״כ הצעה</span><strong>${amount(request.totalCents)} ₪</strong></div>
      <div class="summary-card"><span class="label">תאריך</span><strong>${e(formattedDate)}</strong></div>
    </div>
  </section>

  <section class="title-block">
    <h1>${title} ${e(request.number || "טיוטה")}</h1>
    <div class="reference">עבור תסקיר ${e(request.reportNumber)} · ${e(request.reportType)}</div>
    <div class="subject">הצעת מחיר לביצוע שירותי בדיקה מקצועיים בהתאם למכשירים המפורטים להלן</div>
  </section>

  <table>
    <thead><tr><th>סעיף</th><th>פירוט השירות</th><th>כמות</th><th>מחיר יחידה</th><th>סה״כ</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <section class="after-table">
    <div>
      <div class="signature"><div class="signature-line"></div><div class="signature-label">חתימה וחותמת</div></div>
    </div>
    <div class="totals">
      <div class="total-row"><span>סה״כ לפני מע״מ</span><strong>${amount(request.subtotalCents)} ₪</strong></div>
      <div class="total-row"><span>מע״מ (${request.vatBasisPoints / 100}%)</span><strong>${amount(request.vatCents)} ₪</strong></div>
      <div class="total-row grand"><span>סה״כ לתשלום</span><span>${amount(request.totalCents)} ₪</span></div>
    </div>
  </section>

  <div class="document-note">${footer} ההצעה בתוקף עד ${e(request.dueDate)}.</div>
  <footer>
    <span class="footer-credit">מסמך ממוחשב הופק ע״י <strong>RemindOCR</strong> של <span class="studio">handcoded.tech</span></span>
    <span>הצעת מחיר ${e(request.number || "טיוטה")}</span>
  </footer>
</body>
</html>`;
}
