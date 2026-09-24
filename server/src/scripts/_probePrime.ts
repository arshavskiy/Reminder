import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const { gmailFetch, resolveGmailToken, retryWithRefresh } = await import("../routes/gmail.js");
const { col, connectDb } = await import("../db/db.js");
const { parseInlineReceipt } = await import("../gmail/inlineReceiptParser.js");

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
function strip(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim();
}

await connectDb();
const users = await col<any>("users").find(
  { gmail_refresh_token: { $exists: true, $ne: "" } },
  { projection: { email: 1 } },
).toArray();

for (const user of users) {
  const userId = String(user._id);
  let token = await resolveGmailToken(userId);
  if (!token) continue;
  const q = 'from:googleplay-noreply@google.com (amazon OR prime) newer_than:36m';
  let res = await gmailFetch(token, `messages?q=${encodeURIComponent(q)}&maxResults=15`);
  if (res.status === 401) {
    const refreshed = await retryWithRefresh(userId);
    if (refreshed) {
      token = refreshed;
      res = await gmailFetch(token, `messages?q=${encodeURIComponent(q)}&maxResults=15`);
    }
  }
  const data = await res.json() as { messages?: { id: string }[]; resultSizeEstimate?: number };
  console.log(JSON.stringify({ user: user.email, status: res.status, estimate: data.resultSizeEstimate ?? 0 }));
  for (const message of data.messages ?? []) {
    const msgRes = await gmailFetch(token, `messages/${message.id}?format=full`);
    if (!msgRes.ok) continue;
    const msg = await msgRes.json() as any;
    const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
    const get = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
    const from = get("From");
    const subject = get("Subject");
    const { html, plain } = messageBody(msg.payload);
    const body = html || plain;
    const parsed = parseInlineReceipt(from, body, subject);
    const existing = await col<any>("invoices").findOne({ gmail_message_id: message.id }, { projection: { supplier_name: 1 } });
    console.log(JSON.stringify({
      user: user.email,
      id: message.id,
      subject,
      parsed: parsed ? { merchant: parsed.merchant, amount: parsed.amount, txn: parsed.transactionId, date: parsed.date } : null,
      saved: Boolean(existing),
      snippet: parsed ? undefined : strip(body).slice(0, 600),
    }));
  }
}
process.exit(0);
