/**
 * Import body-only receipts (no attachment) that arrived before their parser
 * existed: AliExpress, Bolt, Grab, Booking.com and Airbnb. For every user with
 * Gmail connected, searches the vendor's receipt mails and imports each one the
 * same way the Invoices page "Import all" does.
 *
 * Skips a mail already imported, and a receipt whose number is already on an invoice.
 * Airbnb receipts for the same booking collapse into one invoice (newest wins).
 *
 * Dry run by default. Uses the local DB unless MONGODB_TARGET=production.
 *   npx tsx src/scripts/backfillInlineReceipts.ts --vendor aliexpress
 *   npx tsx src/scripts/backfillInlineReceipts.ts --vendor bolt,grab,booking,airbnb --apply
 *   npx tsx src/scripts/backfillInlineReceipts.ts --vendor all --user <userId> --apply
 */
import dotenv from "dotenv";
import {parseInlineReceipt} from "../gmail/inlineReceiptParser.js";

dotenv.config({path: ".env.local"});
dotenv.config();

const {gmailFetch, resolveGmailToken, importInlineReceiptMessage} = await import("../routes/gmail.js");
const {col, connectDb, closeDb} = await import("../db/db.js");

const apply = process.argv.includes("--apply");
const userArg = process.argv.indexOf("--user");
const onlyUser = userArg > -1 ? process.argv[userArg + 1] : null;
const VENDOR_QUERIES: Record<string, string> = {
  aliexpress: "from:aliexpress.com subject:(\"order confirmed\" OR \"orders confirmed\")",
  bolt: "from:bolt.eu subject:\"Your Bolt trip\"",
  grab: "from:grab.com subject:\"E-Receipt\"",
  booking: "from:noreply-payments@booking.com subject:\"your receipt\"",
  airbnb: "from:airbnb.com subject:\"receipt from Airbnb\"",
};
const vendorArg = process.argv.indexOf("--vendor");
const vendors = (vendorArg > -1 ? process.argv[vendorArg + 1] : "aliexpress").split(",").map((v) => v.trim().toLowerCase());
const selected = vendors.includes("all") ? Object.keys(VENDOR_QUERIES) : vendors;
for (const vendor of selected) {
  if (!VENDOR_QUERIES[vendor]) throw new Error(`unknown vendor ${vendor}; use ${Object.keys(VENDOR_QUERIES).join(", ")} or all`);
}
const QUERY = selected.map((vendor) => `(${VENDOR_QUERIES[vendor]})`).join(" OR ");

function decodePart(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function messageBody(payload: any): string {
  let html = "";
  let plain = "";
  function walk(node: any) {
    if (!node) return;
    if (!plain && node.mimeType === "text/plain" && node.body?.data) plain = decodePart(String(node.body.data));
    if (!html && node.mimeType === "text/html" && node.body?.data) html = decodePart(String(node.body.data));
    if (node.parts) for (const child of node.parts) walk(child);
  }
  walk(payload);
  return html || plain;
}

async function listMessageIds(token: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = "";
  do {
    const res = await gmailFetch(token, `messages?q=${encodeURIComponent(QUERY)}&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ""}`);
    if (!res.ok) throw new Error(`gmail_list_${res.status}`);
    const data = await res.json() as { messages?: { id: string }[]; nextPageToken?: string };
    ids.push(...(data.messages ?? []).map((message) => message.id));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return ids;
}

const db = await connectDb();
const summary = {db: db.databaseName, mode: apply ? "apply" : "dry-run", users: 0, found: 0, imported: 0, skipped: 0, failed: 0, totals: {} as Record<string, number>};
try {
  const userFilter: Record<string, unknown> = {gmail_access_token: {$nin: [null, ""]}};
  const users = await col<any>("users").find(userFilter, {projection: {_id: 1, email: 1}}).toArray();
  for (const user of users) {
    const userId = String(user._id);
    if (onlyUser && userId !== onlyUser) continue;
    const token = await resolveGmailToken(userId);
    if (!token) continue;
    let ids: string[];
    try {
      ids = await listMessageIds(token);
    } catch (err) {
      console.log(`user=${userId} gmail search failed: ${(err as Error).message}`);
      continue;
    }
    if (!ids.length) continue;
    summary.users += 1;
    console.log(`user ${user.email ?? userId} (${userId}): ${ids.length} receipt mails`);
    summary.found += ids.length;
    const already = await col<any>("invoices").find(
      {user_id: userId, gmail_message_id: {$in: ids}},
      {projection: {gmail_message_id: 1}},
    ).toArray();
    const importedIds = new Set(already.map((row: any) => String(row.gmail_message_id)));

    for (const id of ids) {
      if (importedIds.has(id)) {
        summary.skipped += 1;
        continue;
      }
      const res = await gmailFetch(token, `messages/${id}?format=full`);
      if (!res.ok) {
        summary.failed += 1;
        continue;
      }
      const msg = await res.json() as any;
      const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
      const header = (name: string) => headers.find((h) => h.name.toLowerCase() === name)?.value ?? "";
      const receipt = parseInlineReceipt(header("from"), messageBody(msg.payload), header("subject"));
      if (!receipt) {
        console.log(`  skip (not parsed) ${header("subject")}`);
        summary.skipped += 1;
        continue;
      }
      const duplicate = await col<any>("invoices").findOne({user_id: userId, invoice_number: receipt.transactionId});
      if (duplicate) {
        console.log(`  skip (order already on invoice ${duplicate._id}) ${receipt.transactionId}`);
        summary.skipped += 1;
        continue;
      }
      console.log(`  ${apply ? "import" : "would import"} ${receipt.transactionId} ${receipt.amount} ${receipt.currency}${receipt.merchant ? ` (${receipt.merchant})` : ""}`);
      summary.totals[receipt.currency] = Math.round(((summary.totals[receipt.currency] ?? 0) + receipt.amount) * 100) / 100;
      if (!apply) continue;
      try {
        await importInlineReceiptMessage(token, userId, id, undefined);
        summary.imported += 1;
      } catch (err) {
        console.log(`  failed ${id}: ${(err as Error).message}`);
        summary.failed += 1;
      }
    }
  }
  console.log(JSON.stringify(summary));
} finally {
  await closeDb?.();
  process.exit(0);
}
