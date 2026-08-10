#!/usr/bin/env node
/**
 * Gmail Invoice Downloader
 * Downloads PDF attachments from payment emails (phone, internet, digital services)
 * Run: node index.js
 */

import {google} from "googleapis";
import {createServer} from "http";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "fs";
import {dirname, join} from "path";
import {fileURLToPath} from "url";
import open from "open";

const __dir = dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = join(__dir, "token.json");
const OUT_DIR = join(__dir, "invoices");

const CLIENT_ID = "715853749049-e6d8sn2b5pkvt8fu0tj6qhdeq2jh301s.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REDIRECT_URI = "http://localhost:3333/oauth2callback";

// Senders to include (cell, internet, digital services)
const PAYMENT_SENDERS = [
  "xphone.co.il",
  "digitalocean.com",
  "vercel.com",
  "stripe.com",        // Railway, etc.
  "github.com",
  "namecheap.com",
  "cloudflare.com",
  "aws.amazon.com",
  "google.com",
  "bezeq.co.il",
  "hot.net.il",
  "partner.co.il",
  "cellcom.co.il",
  "012.net.il",
  "iec.co.il",         // electricity (bonus)
];

// Gmail search query — PDFs, last 12 months
const QUERY = `has:attachment filename:pdf newer_than:365d (${PAYMENT_SENDERS.map(s => `from:${s}`).join(" OR ")})`;

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getToken() {
  if (existsSync(TOKEN_PATH)) {
    const token = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
    auth.setCredentials(token);
    console.log("✓ Using saved token");
    return;
  }

  const url = auth.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    prompt: "consent",
  });

  console.log("\nOpening browser for Google auth...");
  await open(url);

  await new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      if (!req.url?.startsWith("/oauth2callback")) return;
      const code = new URL(req.url, "http://localhost:3333").searchParams.get("code");
      res.end("<h2>Auth complete — you can close this tab.</h2>");
      server.close();
      try {
        const { tokens } = await auth.getToken(code);
        auth.setCredentials(tokens);
        writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        console.log("✓ Token saved");
        resolve();
      } catch (e) { reject(e); }
    }).listen(3333);
    console.log("Waiting for auth callback on http://localhost:3333 ...");
  });
}

// ── Gmail helpers ─────────────────────────────────────────────────────────────

async function listAllMessages(gmail) {
  const messages = [];
  let pageToken;
  process.stdout.write("Searching emails");
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: QUERY,
      maxResults: 100,
      pageToken,
    });
    const batch = res.data.messages ?? [];
    messages.push(...batch);
    pageToken = res.data.nextPageToken;
    process.stdout.write(".");
  } while (pageToken);
  console.log(` found ${messages.length} messages`);
  return messages;
}

function sanitize(name) {
  return name.replace(/[/\\:*?"<>|]/g, "_").trim();
}

async function downloadAttachments(gmail, msgId, msgDate) {
  const msg = await gmail.users.messages.get({ userId: "me", id: msgId, format: "full" });
  const parts = msg.data.payload?.parts ?? [];
  const dateStr = msgDate ? new Date(Number(msgDate)).toISOString().slice(0, 10) : "unknown";

  for (const part of parts) {
    if (part.mimeType !== "application/pdf") continue;
    const filename = sanitize(part.filename ?? `attachment_${msgId}.pdf`);
    if (!filename.endsWith(".pdf")) continue;

    const attId = part.body?.attachmentId;
    if (!attId) continue;

    const att = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: msgId,
      id: attId,
    });

    const data = att.data.data.replace(/-/g, "+").replace(/_/g, "/");
    const buf = Buffer.from(data, "base64");
    const outPath = join(OUT_DIR, `${dateStr}_${filename}`);

    if (existsSync(outPath)) {
      console.log(`  skip (exists): ${dateStr}_${filename}`);
      continue;
    }

    writeFileSync(outPath, buf);
    console.log(`  ✓ ${dateStr}_${filename} (${(buf.length / 1024).toFixed(0)} KB)`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await getToken();

  mkdirSync(OUT_DIR, { recursive: true });
  const gmail = google.gmail({ version: "v1", auth });

  const messages = await listAllMessages(gmail);
  if (!messages.length) { console.log("No messages found."); return; }

  console.log(`\nDownloading attachments to: ${OUT_DIR}\n`);
  let i = 0;
  for (const { id, internalDate } of messages) {
    i++;
    process.stdout.write(`[${i}/${messages.length}] `);
    try {
      await downloadAttachments(gmail, id, internalDate);
    } catch (e) {
      console.log(`  ✗ error: ${e.message}`);
    }
    // small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  console.log("\nDone. Files saved to:", OUT_DIR);
}

main().catch(e => { console.error(e); process.exit(1); });
