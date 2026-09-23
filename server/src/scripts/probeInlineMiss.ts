import "../loadEnv";
import { MongoClient, ObjectId } from "mongodb";
import { parseInlineReceipt } from "../gmail/inlineReceiptParser";

const uri = process.env.MONGODB_URI || process.env.MONGODB_LOCAL_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB || "reminder-app";

function decode(data: string): string {
  return Buffer.from(String(data).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function walk(node: any, out: { html: string | null; plain: string | null }) {
  if (!node) return;
  if (node.body?.data && node.mimeType === "text/plain" && !out.plain) out.plain = decode(node.body.data);
  if (node.body?.data && node.mimeType === "text/html" && !out.html) out.html = decode(node.body.data);
  for (const child of node.parts ?? []) walk(child, out);
}

function domain(from: string): string {
  const match = from.match(/@([a-z0-9.-]+)/i);
  return match ? match[1].toLowerCase() : "unknown";
}

async function tokenFor(db: ReturnType<MongoClient["db"]>, userId: string): Promise<string> {
  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  if (!user) throw new Error("user missing");
  const expires = user.gmail_token_expires_at ? new Date(user.gmail_token_expires_at) : null;
  const refresh = String(user.gmail_refresh_token ?? "");
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  console.log(JSON.stringify({
    hasAccess: Boolean(user.gmail_access_token),
    expired: Boolean(expires && expires <= new Date()),
    hasRefresh: Boolean(refresh),
    hasClientId: Boolean(clientId),
    hasSecret: Boolean(clientSecret),
  }));
  if (user.gmail_access_token && (!expires || expires > new Date())) return String(user.gmail_access_token);
  const envRefresh = process.env.GMAIL_REFRESH_TOKEN ?? "";
  if (!refresh && envRefresh) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: envRefresh,
        grant_type: "refresh_token",
      }),
    });
    if (!response.ok) throw new Error(`env refresh failed ${response.status}`);
    const data = await response.json() as { access_token: string };
    return data.access_token;
  }
  if (!refresh || !clientId || !clientSecret) throw new Error("cannot refresh gmail token");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`refresh failed ${response.status} ${body.slice(0, 180)}`);
  }
  const data = await response.json() as { access_token: string };
  return data.access_token;
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const jobs = await db.collection("gmail_import_jobs").find({ kind: "inline" }).sort({ created_at: -1 }).limit(5).toArray();
  console.log(JSON.stringify(jobs.map((job) => ({
    status: job.status,
    results: Array.isArray(job.results) ? job.results.length : 0,
    messageIds: Array.isArray(job.message_ids) ? job.message_ids.length : 0,
    imported: job.imported ?? 0,
    rejected: job.rejected ?? 0,
  }))));
  const job = jobs.find((item) => Array.isArray(item.results) && item.results.length)
    ?? jobs.find((item) => Array.isArray(item.message_ids) && item.message_ids.length)
    ?? jobs[0];
  if (!job) throw new Error("no inline job");
  const rows = ((job.results?.length ? job.results : (job.message_ids ?? []).map((messageId: string) => ({ messageId }))) ?? []) as Array<{ messageId: string; import_status?: string }>;
  const access = await tokenFor(db, String(job.user_id));
  const passed: Record<string, number> = {};
  const failed: Record<string, number> = {};
  let pass = 0;
  let fail = 0;
  let errors = 0;

  async function check(row: { messageId: string }) {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${row.messageId}?format=full`, {
      headers: { Authorization: `Bearer ${access}` },
    });
    if (!response.ok) {
      errors += 1;
      return;
    }
    const msg = await response.json() as any;
    const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
    const get = (name: string) => headers.find((header) => header.name.toLowerCase() === name)?.value ?? "";
    const from = get("from");
    const subject = get("subject");
    const bodies = { html: null as string | null, plain: null as string | null };
    walk(msg.payload, bodies);
    const parsed = (bodies.html ? parseInlineReceipt(from, bodies.html, subject) : null)
      ?? (bodies.plain ? parseInlineReceipt(from, bodies.plain, subject) : null);
    const key = domain(from);
    if (parsed) {
      pass += 1;
      passed[parsed.vendor] = (passed[parsed.vendor] ?? 0) + 1;
    } else {
      fail += 1;
      failed[key] = (failed[key] ?? 0) + 1;
    }
  }

  const queue = [...rows];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const row = queue.shift();
      if (row) await check(row);
    }
  });
  await Promise.all(workers);
  console.log(JSON.stringify({
    checked: rows.length,
    previouslySaved: rows.filter((row) => row.import_status === "invoice").length,
    pass,
    fail,
    errors,
    passed,
    failed,
  }));
  await client.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
