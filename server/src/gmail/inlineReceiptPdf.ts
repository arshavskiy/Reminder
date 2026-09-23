import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "node:url";
import type { ParsedInlineReceipt } from "./inlineReceiptParser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEBREW_FONT = join(__dirname, "../../../scripts/NotoSansHebrew.ttf");

// Renders a one-page PDF summarizing a parsed inline receipt, so it can go
// through the normal document import pipeline (which expects a file) instead
// of a separate no-file code path. The PDF is a clear, structured restatement
// of exactly what the parser already extracted — the AI extraction step that
// runs afterward reads this page, not the original email.
export async function renderInlineReceiptPdf(receipt: ParsedInlineReceipt, subject: string, from: string): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const fontAvailable = existsSync(HEBREW_FONT);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `${receipt.vendor} receipt ${receipt.transactionId}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (fontAvailable) doc.registerFont("Hebrew", HEBREW_FONT);
    const setFont = (size: number, bold = false) => doc.font(fontAvailable ? "Hebrew" : (bold ? "Helvetica-Bold" : "Helvetica")).fontSize(size).fillColor("#111111");
    const row = (label: string, value: string) => {
      setFont(10);
      doc.text(`${label}: ${value}`, { align: "left" });
      doc.moveDown(0.4);
    };

    setFont(18, true);
    doc.text(`${receipt.vendor} — Payment Receipt`, { align: "left" });
    doc.moveDown(0.8);
    doc.moveTo(56, doc.y).lineTo(539, doc.y).stroke("#cfd5dc");
    doc.moveDown(0.8);

    row("Transaction ID", receipt.transactionId);
    if (receipt.merchant) row("Merchant", receipt.merchant);
    row("Amount", `${receipt.amount.toFixed(2)} ${receipt.currency}`);
    if (receipt.date) row("Date", receipt.date);

    doc.moveDown(0.6);
    doc.moveTo(56, doc.y).lineTo(539, doc.y).stroke("#cfd5dc");
    doc.moveDown(0.6);
    setFont(8);
    doc.fillColor("#777777");
    doc.text("Generated from an inline payment-confirmation email (no PDF attachment was provided by the sender).", { align: "left" });
    doc.moveDown(0.3);
    doc.text(`Source subject: ${subject}`, { align: "left" });
    doc.text(`Source sender: ${from}`, { align: "left" });

    doc.end();
  });
}
