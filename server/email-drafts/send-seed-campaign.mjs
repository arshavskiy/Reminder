import {appendFile, readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {config} from "dotenv";
import {Resend} from "resend";

// Usage:
//   node send-seed-campaign.mjs           preview only
//   node send-seed-campaign.mjs --test    send one copy to arshavsky.pasha@gmail.com
//   node send-seed-campaign.mjs --send    send to every manifest recipient (resumable)
config({path: new URL("../.env.local", import.meta.url), quiet: true});
config({path: new URL("../.env", import.meta.url), quiet: true});
const manifest = JSON.parse(await readFile(new URL("../data/outreach/seed-introduction-manifest.json", import.meta.url), "utf8"));
const receiptPath = new URL("../data/outreach/seed-introduction-receipts.jsonl", import.meta.url);
const html = await readFile(new URL("./inspector-introduction.html", import.meta.url), "utf8");
const text = await readFile(new URL("./inspector-introduction.txt", import.meta.url), "utf8");
const message = {
  from: "RemindOCR <contact@remindocr.com>",
  replyTo: "contact@remindocr.com",
  subject: "פרסומת: ניהול מסמכים, תפוגות ותזכורות — RemindOCR",
  headers: {"List-Unsubscribe": "<mailto:contact@remindocr.com?subject=unsubscribe>"},
  html,
  text,
};
if (manifest.campaign !== "seed-introduction-v1") throw new Error("Unexpected campaign manifest");
if (new Set(manifest.recipients).size !== manifest.recipients.length
  || manifest.recipients.some(email => !/^[^\s@,;<>/]+@[^\s@,;<>/]+\.[a-z]{2,}$/.test(email))) {
  throw new Error("Invalid or duplicate recipients");
}
if (!html.includes('dir="rtl"') || !text.includes("אני פבל")) throw new Error("Email content validation failed");

const payloadHash = createHash("sha256").update(JSON.stringify({message, recipients: manifest.recipients})).digest("hex");
const mode = process.argv.includes("--send") ? "send" : process.argv.includes("--test") ? "test" : "preview";
console.log(JSON.stringify({mode, recipients: manifest.recipients.length, from: message.from, subject: message.subject, payloadHash: payloadHash.slice(0, 12)}));
if (mode === "preview") process.exit(0);
if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required");
const resend = new Resend(process.env.RESEND_API_KEY);

if (mode === "test") {
  const {data, error} = await resend.emails.send({...message, to: ["arshavsky.pasha@gmail.com"]}, {
    idempotencyKey: `seed-test-${payloadHash}`,
  });
  if (error) throw new Error(`${error.name}: ${error.message}`);
  console.log(JSON.stringify({status: "accepted", id: data.id, to: "arshavsky.pasha@gmail.com"}));
  process.exit(0);
}

let receipts = [];
try {
  receipts = (await readFile(receiptPath, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
} catch (error) { if (error.code !== "ENOENT") throw error; }
if (receipts.some(receipt => receipt.payloadHash !== payloadHash)) throw new Error("Campaign changed after sending began; inspect receipts before continuing");
const completed = new Set(receipts.map(receipt => receipt.batch));
for (let offset = 0; offset < manifest.recipients.length; offset += 100) {
  const batch = offset / 100;
  if (completed.has(batch)) continue;
  const recipients = manifest.recipients.slice(offset, offset + 100);
  const {data, error} = await resend.batch.send(recipients.map(email => ({...message, to: [email]})), {
    idempotencyKey: `seed-v1-${payloadHash}-${batch}`,
  });
  if (error) throw new Error(`${error.name}: ${error.message}`);
  const receipt = {batch, payloadHash, acceptedAt: new Date().toISOString(), recipients, result: data};
  await appendFile(receiptPath, JSON.stringify(receipt) + "\n");
  console.log(JSON.stringify({batch, status: "accepted", count: recipients.length}));
  await new Promise(resolve => setTimeout(resolve, 1000));
}
