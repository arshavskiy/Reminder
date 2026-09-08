import {appendFile, readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {config} from "dotenv";
import {Resend} from "resend";

config({path: new URL("../.env.local", import.meta.url), quiet: true});
config({path: new URL("../.env", import.meta.url), quiet: true});
const manifest = JSON.parse(await readFile(new URL("../data/outreach/inspector-introduction-manifest.json", import.meta.url), "utf8"));
const receiptPath = new URL("../data/outreach/inspector-introduction-receipts.jsonl", import.meta.url);
const html = await readFile(new URL("./inspector-introduction.html", import.meta.url), "utf8");
const text = await readFile(new URL("./inspector-introduction.txt", import.meta.url), "utf8");
const message = {
  from: "RemindOCR <contact@remindocr.com>",
  replyTo: "contact@remindocr.com",
  subject: "ניהול דוחות ותזכורות לבדיקות — RemindOCR",
  html,
  text,
};
if (manifest.collection !== "inspector_leads" || manifest.campaign !== "inspector-introduction-contact-footer-v2") {
  throw new Error("Unexpected campaign manifest");
}
if (new Set(manifest.recipients).size !== manifest.recipients.length
  || manifest.recipients.some(email => !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email))) {
  throw new Error("Invalid or duplicate recipients");
}
const payloadHash = createHash("sha256").update(JSON.stringify({message, recipients: manifest.recipients})).digest("hex");
let receipts = [];
try {
  receipts = (await readFile(receiptPath, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
} catch (error) { if (error.code !== "ENOENT") throw error; }
if (receipts.some(receipt => receipt.payloadHash !== payloadHash)) throw new Error("Campaign changed after sending began; inspect receipts before continuing");
const completed = new Set(receipts.map(receipt => receipt.batch));
console.log(JSON.stringify({mode: process.argv.includes("--send") ? "send" : "preview", recipients: manifest.recipients.length, from: message.from, subject: message.subject, completedBatches: completed.size}));
if (process.argv.includes("--send")) {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required");
  const resend = new Resend(process.env.RESEND_API_KEY);
  for (let offset = 0; offset < manifest.recipients.length; offset += 100) {
    const batch = offset / 100;
    if (completed.has(batch)) continue;
    const recipients = manifest.recipients.slice(offset, offset + 100);
    const {data, error} = await resend.batch.send(recipients.map(email => ({...message, to: [email]})), {
      idempotencyKey: `inspectors-v2-${payloadHash}-${batch}`,
    });
    if (error) throw new Error(`${error.name}: ${error.message}`);
    const receipt = {batch, payloadHash, acceptedAt: new Date().toISOString(), recipients, result: data};
    await appendFile(receiptPath, JSON.stringify(receipt) + "\n");
    console.log(JSON.stringify({batch, status: "accepted", count: recipients.length, ids: data.data.map(item => item.id)}));
  }
}
