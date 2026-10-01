// Real collaborators for the email-in handler (see inboundEmail.ts).
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { extname, join } from "path";
import { ObjectId } from "mongodb";
import { col } from "../db/db";
import { logger } from "../logger";
import { isFeatureEnabledForUser } from "../features";
import { importFile } from "../pipeline/importer";
import { mainDocumentsFilter } from "../documents/documentVisibility";
import { releaseTempFile, tempDir } from "../storage/tempFiles";
import { effectivePlanId, planAllowsDocumentImport } from "../plans/tierFeatures";
import { assertDocumentImportQuota, DocumentImportQuotaError } from "../quotas/documentImportQuota";
import { scanInlineEmailForObligation } from "../gmail/inlineObligationScan";
import { discoveryId, persistDiscovery, plainEmailHtml } from "../gmail/discoveryStore";
import { sendToUser } from "../push/pushService";
import { handleInboundEmailEvent, type InboundDeps, type InboundEmail } from "./inboundEmail";

const DISCOVERY_ACCOUNT = "inbound-email";

export function inboundEmailDomain(): string | null {
  return process.env.INBOUND_EMAIL_DOMAIN?.trim() || null;
}

// Reading a received email needs a key with more than "sending access", which
// is all RESEND_API_KEY may have. A separate key keeps the sending key restricted;
// without one we fall back to RESEND_API_KEY.
async function resendClient() {
  const { Resend } = await import("resend");
  return new Resend(process.env.RESEND_INBOUND_API_KEY?.trim() || process.env.RESEND_API_KEY);
}

export function createInboundDeps(): InboundDeps {
  return {
    domain: inboundEmailDomain(),

    async findUserByToken(token) {
      const settings = await col<any>("user_settings").findOne({ inbound_email_token: token });
      if (!settings?.user_id) return null;
      let user: any = null;
      try { user = await col<any>("users").findOne({ _id: new ObjectId(String(settings.user_id)) } as any); } catch { /* unknown user */ }
      if (!user) return null;
      const plan = effectivePlanId(user);
      return { userId: String(settings.user_id), plan, importAllowed: planAllowsDocumentImport(plan) };
    },

    async claimEmail(emailId, userId) {
      try {
        await col<any>("inbound_emails").insertOne({ _id: emailId, user_id: userId, received_at: new Date(), status: "processing" } as any);
        return true;
      } catch (error) {
        if ((error as { code?: number }).code === 11000) return false;
        throw error;
      }
    },

    async countToday(userId) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return col("inbound_emails").countDocuments({ user_id: userId, received_at: { $gte: start } } as any);
    },

    async fetchEmail(emailId): Promise<InboundEmail> {
      const resend = await resendClient();
      const { data, error } = await resend.emails.receiving.get(emailId);
      if (error || !data) throw new Error(`inbound_fetch_failed: ${error?.message ?? "no data"}`);
      return {
        id: data.id,
        from: data.from,
        to: data.to,
        subject: data.subject,
        text: data.text,
        html: data.html,
        headers: data.headers,
        attachments: data.attachments.map((attachment) => ({
          id: attachment.id,
          filename: attachment.filename,
          size: attachment.size,
          content_type: attachment.content_type,
          content_disposition: attachment.content_disposition,
          content_id: attachment.content_id,
        })),
      };
    },

    async downloadAttachment(emailId, attachmentId) {
      const resend = await resendClient();
      const { data, error } = await resend.emails.receiving.attachments.get({ emailId, id: attachmentId });
      if (error || !data?.download_url) throw new Error(`inbound_attachment_failed: ${error?.message ?? "no url"}`);
      const response = await fetch(data.download_url);
      if (!response.ok) throw new Error(`inbound_attachment_download_${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },

    async assertQuota(user) {
      await assertDocumentImportQuota(user.userId, user.plan, 1, "documents", "email");
    },

    isQuotaError: (error) => error instanceof DocumentImportQuotaError,

    async importDocument(user, filename, bytes) {
      const destPath = join(tempDir("uploads"), `${Date.now()}-${randomUUID()}${extname(filename) || ""}`);
      writeFileSync(destPath, bytes);
      const before = await col("documents").countDocuments(mainDocumentsFilter(user.userId));
      try {
        const id = await importFile(destPath, undefined, user.userId, filename, {
          queueProcessing: true,
          processingJobContext: { source: "email" },
          quotaCategory: "documents",
        });
        const after = await col("documents").countDocuments(mainDocumentsFilter(user.userId));
        return { id: String(id), duplicate: after === before };
      } finally {
        releaseTempFile(destPath);
      }
    },

    async saveDiscovery(user, email) {
      if (!await isFeatureEnabledForUser(user.userId, "pages.discovery")) return false;
      const proposal = scanInlineEmailForObligation({ from: email.from, subject: email.subject, plain: email.text, html: email.html });
      if (!proposal) return false;
      await persistDiscovery({
        _id: discoveryId(user.userId, DISCOVERY_ACCOUNT, email.id),
        user_id: user.userId,
        account: DISCOVERY_ACCOUNT,
        messageId: email.id,
        subject: email.subject,
        from: email.from,
        date: new Date().toUTCString(),
        ...proposal,
        attachment_name: null,
        preview_html: email.html ?? plainEmailHtml(email.text ?? ""),
        plain_text: email.text,
        pdfs: [],
      });
      return true;
    },

    async finish(emailId, user, summary) {
      await col<any>("inbound_emails").updateOne({ _id: emailId } as any, { $set: { ...summary, finished_at: new Date() } });
      const done = summary.status === "done";
      const imported = Number(summary.imported ?? 0);
      const duplicates = Number(summary.duplicates ?? 0);
      if (!done || (!imported && !duplicates && !summary.discovery)) return;
      const title = imported
        ? `יובאו ${imported} מסמכים מהדואר`
        : summary.discovery ? "נמצא מועד חדש בהודעה שהועברה" : "המסמכים כבר קיימים במערכת";
      const body = String(summary.subject ?? "");
      await col("notifications").insertOne({
        user_id: user.userId, kind: "inbound_email", title, body, created_at: new Date(), read_at: null,
      } as any);
      await sendToUser(user.userId, {
        title,
        body,
        data: { url: summary.discovery && !imported ? "/discover-reminders" : "/documents", kind: "inbound_email" },
      });
    },
  };
}

/** Runs after the webhook has been acknowledged; failures are logged, never thrown. */
export async function processInboundEvent(event: unknown): Promise<void> {
  try {
    const outcome = await handleInboundEmailEvent(event as Parameters<typeof handleInboundEmailEvent>[0], createInboundDeps());
    logger.info("inbound_email_handled", { outcome });
  } catch (error) {
    logger.error("inbound_email_failed", { error: error instanceof Error ? error.message : String(error) });
  }
}
