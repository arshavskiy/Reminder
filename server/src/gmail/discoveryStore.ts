import { createHash } from "crypto";
import { mkdir, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { col } from "../db/db";
import { getDataDir } from "../settings";
import { spacesEnabled, uploadToSpaces } from "../storage/spaces";
import type { InlineObligationProposal } from "./inlineObligationScan";

export interface DiscoveryFile {
  id: string;
  filename: string;
  size: number;
  spaces_key: string | null;
  local_path: string | null;
}
export interface DiscoveryRecord extends InlineObligationProposal {
  _id: string;
  user_id: string;
  account: string;
  messageId: string;
  subject: string;
  from: string;
  date: string;
  attachment_name: string | null;
  preview_html: string;
  plain_text: string | null;
  pdfs: DiscoveryFile[];
  status: "new" | "created" | "dismissed";
  created_at: Date;
  updated_at: Date;
}
export const discoveries = () => col<DiscoveryRecord>("reminder_discoveries");
export function discoveryId(userId: string, account: string, messageId: string): string {
  return createHash("sha256").update(JSON.stringify([userId, account, messageId])).digest("hex");
}
export function plainEmailHtml(plain: string): string {
  return `<pre>${plain.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
}
export function discoverySummary(row: DiscoveryRecord) {
  const { preview_html, plain_text, user_id, pdfs, ...rest } = row;
  return { ...rest, id: row._id, pdfs: pdfs.map(({ id, filename, size }) => ({ id, filename, size })) };
}
export async function saveDiscoveryPdf(recordId: string, attachmentId: string, filename: string, bytes: Buffer): Promise<DiscoveryFile> {
  const id = createHash("sha256").update(attachmentId).digest("hex");
  const key = `reminder-discoveries/${recordId}/${id}.pdf`;
  const directory = join(getDataDir(), "reminder-discoveries", recordId);
  await mkdir(directory, { recursive: true });
  const localPath = join(directory, `${id}.pdf`);
  await writeFile(localPath, bytes);
  if (spacesEnabled()) {
    // The invoice/document upload path creates private objects, unlike the public buffer helper.
    await uploadToSpaces(localPath, key, "application/pdf");
    await unlink(localPath).catch(() => undefined);
    return { id, filename, size: bytes.length, spaces_key: key, local_path: null };
  }
  return { id, filename, size: bytes.length, spaces_key: null, local_path: localPath };
}

export async function persistDiscovery(row: Omit<DiscoveryRecord, "status" | "created_at" | "updated_at">) {
  const { _id, ...fields } = row;
  await discoveries().updateOne({ _id, user_id: row.user_id }, {
    $set: { ...fields, updated_at: new Date() },
    $setOnInsert: { status: "new", created_at: new Date() },
  }, { upsert: true });
  const saved = await discoveries().findOne({ _id, user_id: row.user_id });
  if (!saved) throw new Error("discovery_save_failed");
  return discoverySummary(saved);
}
