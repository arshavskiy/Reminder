import { sendPushToAdmins } from "./pushService";
import { logger } from "../logger";

// Fire-and-forget admin push helpers. Never throw into the caller's flow — a
// failed notification must not break the event that triggered it.
function fire(title: string, body: string, url = "/admin"): void {
  sendPushToAdmins({ title, body, data: { url } }).catch((err) => {
    logger.warn("admin_notify_failed", { title, error: err instanceof Error ? err.message : String(err) });
  });
}

export function notifyEmailSendFailed(opts: { recipient?: string | null; error?: string | null; title?: string | null }): void {
  fire("שליחת תזכורת נכשלה", `${opts.title ?? "תזכורת"} → ${opts.recipient ?? "?"}: ${opts.error ?? "שגיאה"}`);
}

export function notifyExtractionFailed(opts: { fileName?: string | null; error?: string | null }): void {
  fire("חילוץ מסמך נכשל", `${opts.fileName ?? "מסמך"}: ${opts.error ?? "שגיאה"}`);
}

export function notifyDocumentUploaded(opts: { fileName?: string | null; userEmail?: string | null }): void {
  fire("מסמך חדש הועלה", `${opts.fileName ?? "מסמך"}${opts.userEmail ? ` · ${opts.userEmail}` : ""}`, "/admin");
}

export function buildReminderSkipAdminAlert(opts: {
  title?: string | null;
  reminderId?: string | null;
  reason?: string | null;
}): { pushTitle: string; pushBody: string } {
  const title = opts.title?.trim() || "תזכורת";
  const reason = opts.reason === "no_recipients" || !opts.reason
    ? "אין נמען מוגדר / חסר אימייל ללקוח"
    : opts.reason;
  const reminderId = opts.reminderId?.trim() || "";
  return {
    pushTitle: "תזכורת לא נשלחה",
    pushBody: `${title} — ${reason}${reminderId ? ` (${reminderId})` : ""}`,
  };
}

export function notifyReminderSkipped(opts: {
  title?: string | null;
  reminderId?: string | null;
  clientId?: string | null;
  userId?: string | null;
  reason?: string | null;
}): void {
  const alert = buildReminderSkipAdminAlert(opts);
  fire(alert.pushTitle, alert.pushBody);
}

export function notifyPasswordResetRequested(opts: { email?: string | null }): void {
  fire("בקשת איפוס סיסמה", opts.email ? `נשלח קישור איפוס אל ${opts.email}` : "נשלח קישור איפוס סיסמה", "/admin");
}
