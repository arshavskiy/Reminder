/**
 * Re-parse stored Google Play inline receipts and write the app name as the
 * supplier. The old import kept supplier_name as "Google Play" and, on the
 * thank-you layout, never captured the item line or the later auto-charge.
 *
 * Reads preview_html when it is already stored. Otherwise fetches the Gmail
 * message recorded on the invoice and parses that body.
 *
 * Dry run by default.
 *   npx tsx src/scripts/backfillGooglePlayMerchant.ts
 *   npx tsx src/scripts/backfillGooglePlayMerchant.ts --apply
 *   npx tsx src/scripts/backfillGooglePlayMerchant.ts --dev --apply
 */
import dotenv from "dotenv";
import {parseInlineReceipt} from "../gmail/inlineReceiptParser.js";
import {emailBodyToPreviewHtml} from "../gmail/emailPreview.js";

dotenv.config({path: ".env.local"});
dotenv.config();

const {gmailFetch, resolveGmailToken, retryWithRefresh} = await import("../routes/gmail.js");
const {col, connectDb} = await import("../db/db.js");

const apply = process.argv.includes("--apply");

function decodePart(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function messageBody(payload: any): { html: string; plain: string } {
  let html = "";
  let plain = "";
  function walk(node: any) {
    if (!node) return;
    if (!plain && node.mimeType === "text/plain" && node.body?.data) plain = decodePart(String(node.body.data));
    if (!html && node.mimeType === "text/html" && node.body?.data) html = decodePart(String(node.body.data));
    if (node.parts) for (const child of node.parts) walk(child);
  }
  walk(payload);
  return { html, plain };
}

async function loadBody(userId: string, messageId: string, tokens: Map<string, string | null>): Promise<string> {
  let token = tokens.get(userId);
  if (token === undefined) {
    token = await resolveGmailToken(userId);
    tokens.set(userId, token);
  }
  if (!token || !messageId) return "";
  let res = await gmailFetch(token, `messages/${messageId}?format=full`);
  if (res.status === 401) {
    const refreshed = await retryWithRefresh(userId);
    if (refreshed) {
      tokens.set(userId, refreshed);
      res = await gmailFetch(refreshed, `messages/${messageId}?format=full`);
    }
  }
  if (!res.ok) {
    console.log(`gmail ${res.status} user=${userId} message=${messageId}`);
    return "";
  }
  const msg = await res.json() as { payload?: unknown };
  const { html, plain } = messageBody(msg.payload);
  return html || plain;
}

function renewalNote(receipt: NonNullable<ReturnType<typeof parseInlineReceipt>>): string | null {
  if (!receipt.renewalAmount) return null;
  return `Next charge ${receipt.renewalAmount.toFixed(2)} ${receipt.currency}/${receipt.renewalInterval ?? "period"}${receipt.renewalDate ? ` from ${receipt.renewalDate}` : ""}`;
}

const db = await connectDb();
try {
  const rows = await col("invoices").find({
    source: "gmail_inline",
    $or: [
      {preview_html: {$exists: false}},
      {preview_html: null},
      {preview_html: ""},
    ],
  }).toArray();

  let updated = 0;
  let skipped = 0;
  const tokens = new Map<string, string | null>();

  for (const row of rows) {
    let html = typeof row.preview_html === "string" ? row.preview_html : "";
    if (!html.trim() && row.gmail_message_id && row.user_id) {
      html = await loadBody(String(row.user_id), String(row.gmail_message_id), tokens);
    }
    if (!html.trim()) {
      skipped++;
      console.log(`skip ${row._id} no email body invoice=${row.invoice_number ?? ""}`);
      continue;
    }
    const preview = emailBodyToPreviewHtml(html.trim().startsWith("<") ? html : null, html.trim().startsWith("<") ? null : html);
    if (!preview) {
      skipped++;
      console.log(`skip ${row._id} empty preview invoice=${row.invoice_number ?? ""}`);
      continue;
    }
    const from = String(row.fields?.source_from ?? "googleplay-noreply@google.com");
    const receipt = parseInlineReceipt(from, html, String(row.fields?.source_subject ?? ""));
    const merchant = receipt?.vendor === "Google Play" ? (receipt.merchant?.trim() || "") : "";
    const set: Record<string, unknown> = {
      preview_html: preview,
      updated_at: new Date(),
    };
    if (merchant && merchant !== "Google Play") {
      const note = renewalNote(receipt!);
      set.supplier_name = merchant;
      set.notes = ["Google Play", note].filter(Boolean).join(" · ");
      set["fields.supplier_name"] = merchant;
      set["fields.merchant"] = merchant;
      set["fields.renewal_amount"] = receipt!.renewalAmount ?? null;
      set["fields.renewal_interval"] = receipt!.renewalInterval ?? null;
      set["fields.renewal_date"] = receipt!.renewalDate ?? null;
    }
    updated++;
    console.log(JSON.stringify({
      id: String(row._id),
      invoice: row.invoice_number ?? null,
      preview: preview.length,
      merchant: merchant || null,
    }));
    if (!apply) continue;
    await col("invoices").updateOne({_id: row._id} as any, {$set: set});
  }

  console.log(JSON.stringify({db: db.databaseName, rows: rows.length, updated, skipped, mode: apply ? "apply" : "dry-run"}));
} finally {
  process.exit(0);
}
