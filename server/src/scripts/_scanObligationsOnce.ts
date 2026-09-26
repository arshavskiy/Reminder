import "./loadEnv";
import { writeFileSync } from "fs";
import { join } from "path";
import { connectDb, closeDb, col } from "../db/db";
import { gmailFetch, resolveGmailToken } from "../routes/gmail";
import { htmlToPlainText, scanInlineEmailForObligation } from "../gmail/inlineObligationScan";
import { parsePdf } from "../pipeline/pdfParser";
import { releaseTempFile, tempDir } from "../storage/tempFiles";

const EMAIL = "arshavsky.pasha@gmail.com";

interface MimePart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string };
  parts?: MimePart[];
}

function decode(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

async function main() {
  await connectDb();
  const user = await col<any>("users").findOne({ email: EMAIL });
  if (!user) throw new Error("user_not_found");
  const token = await resolveGmailToken(String(user._id));
  if (!token) throw new Error("gmail_not_connected");
  const query = `"הודעה על חוב בארנונה - דרישת לתשלום"`;
  const list = await gmailFetch(token, `messages?q=${encodeURIComponent(query)}&maxResults=1`);
  const listed = await list.json() as { messages?: { id: string }[] };
  const id = listed.messages?.[0]?.id;
  if (!id) throw new Error("message_not_found");
  const response = await gmailFetch(token, `messages/${id}?format=full`);
  const message = await response.json() as { payload?: MimePart };
  const headers = message.payload?.headers ?? [];
  const header = (name: string) => headers.find((row) => row.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  let plain: string | null = null;
  let html: string | null = null;
  let pdfId = "";
  let pdfName = "";
  function walk(node: MimePart | undefined) {
    if (!node) return;
    const name = node.filename ?? "";
    if (node.body?.attachmentId && (node.mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf")) && !pdfId) {
      pdfId = node.body.attachmentId;
      pdfName = name;
    }
    if (node.body?.data && node.mimeType === "text/plain" && !plain) plain = decode(node.body.data);
    if (node.body?.data && node.mimeType === "text/html" && !html) html = decode(node.body.data);
    for (const child of node.parts ?? []) walk(child);
  }
  walk(message.payload);
  const att = await gmailFetch(token, `messages/${id}/attachments/${pdfId}`);
  const data = await att.json() as { data?: string };
  const bytes = Buffer.from(String(data.data ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const tmpPath = join(tempDir("gmail-tmp"), `obligation-check-${Date.now()}.pdf`);
  writeFileSync(tmpPath, bytes);
  try {
    const parsed = await parsePdf(tmpPath);
    const emailText = (html ? htmlToPlainText(html) : plain ?? "").trim();
    const proposal = scanInlineEmailForObligation({
      from: header("From"),
      subject: header("Subject"),
      plain: [emailText, parsed.text].filter(Boolean).join("\n"),
      html: null,
      now: new Date("2026-09-26T00:00:00Z"),
    });
    console.log(JSON.stringify({
      subject: header("Subject"),
      filename: pdfName,
      emailChars: emailText.length,
      pdfChars: parsed.text.trim().length,
      kind: proposal?.kind ?? null,
      due_date: proposal?.due_date ?? null,
      warning: proposal?.warning ?? null,
    }));
  } finally {
    releaseTempFile(tmpPath);
  }
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
