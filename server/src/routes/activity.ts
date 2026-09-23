import express from "express";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {HTTPException, requireAuth} from "../auth/middleware";

const MAX_LIMIT = 200;

function tryObjectId(id: string): ObjectId | string {
  try {
    return new ObjectId(id);
  } catch {
    return id;
  }
}

export type ActivityEntry = {
  id: string;
  kind: "email" | "document";
  title: string;
  detail: string | null;
  at: string;
  status: "ok" | "failed" | "info";
  document_id: string | null;
  client_name: string | null;
  recipient: string | null;
  subject: string | null;
  file_name: string | null;
  note: string | null;
  channel: "email" | "system";
};

function isoDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  return null;
}

const EMAIL_KIND_LABEL: Record<string, string> = {
  send: "תזכורת נשלחה",
  skipped: "תזכורת דולגה",
  escalation: "הסלמה נשלחה",
  bounce: "הודעה חזרה",
  complaint: "התקבלה תלונה",
};

export function registerActivityRoutes(app: express.Application) {
  // GET /api/activity — one date-sorted feed over the two collections that
  // already record user-visible history: reminder email sends and per-client
  // document events. Read-only; nothing here writes.
  app.get("/api/activity", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({error: err.message});
      return;
    }

    const requestedLimit = parseInt((req.query.limit as string) ?? "100");
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_LIMIT)
      : 100;
    const kind = req.query.kind as string | undefined;

    try {
      // email_log predates its own user_id column — 262 of ~3.7k rows have none —
      // so filtering on it alone would silently drop the oldest history. Those rows
      // are reachable through the user's own reminder ids instead.
      const reminderIds = await col("reminders")
        .find({user_id: userId} as any, {projection: {_id: 1, client_id: 1}})
        .limit(5000)
        .toArray();
      const reminderIdStrings = reminderIds.map((r: any) => String(r._id));
      const reminderClientById = new Map(
        (reminderIds as any[]).map((r) => [String(r._id), r.client_id ? String(r.client_id) : null]),
      );

      const emailFilter: Record<string, any> = reminderIdStrings.length
        ? {$or: [{user_id: userId}, {reminder_id: {$in: reminderIdStrings}}]}
        : {user_id: userId};

      // timeline_events is keyed by client_id, never user_id, so it has to be
      // constrained to this user's own clients or it would leak across tenants.
      const clientIds = await col("clients")
        .find({user_id: userId} as any, {projection: {_id: 1, display_name: 1}})
        .limit(5000)
        .toArray();
      const clientIdStrings = clientIds.map((c: any) => String(c._id));
      const clientNameById = new Map(
        (clientIds as any[]).map((c) => [String(c._id), typeof c.display_name === "string" ? c.display_name : undefined]),
      );

      const wantEmail = kind !== "document";
      const wantDocument = kind !== "email";

      const [emailRows, documentRows] = await Promise.all([
        wantEmail
          ? col("email_log").find(emailFilter as any).sort({sent_at: -1}).limit(limit).toArray()
          : Promise.resolve([]),
        wantDocument && clientIdStrings.length
          ? col("timeline_events")
            .find({client_id: {$in: clientIdStrings}} as any)
            .sort({event_date: -1})
            .limit(limit)
            .toArray()
          : Promise.resolve([]),
      ]);

      const entries: ActivityEntry[] = [];

      for (const row of emailRows as any[]) {
        const at = isoDate(row.sent_at);
        if (!at) continue;
        const logType = String(row.log_type ?? "send");
        const failed = row.success === 0 || logType === "bounce" || logType === "complaint";
        const subject = typeof row.subject === "string" && row.subject.trim() ? row.subject.trim() : null;
        const recipientRaw = row.to_address ?? row.recipient;
        const recipient = typeof recipientRaw === "string" && recipientRaw.trim() ? recipientRaw.trim() : null;
        const note = typeof row.error === "string" && row.error.trim() ? row.error.trim() : null;
        const reminderClientId = row.reminder_id ? reminderClientById.get(String(row.reminder_id)) : null;
        entries.push({
          id: String(row._id),
          kind: "email",
          title: EMAIL_KIND_LABEL[logType] ?? "פעילות אימייל",
          detail: [subject, recipient, note].filter(Boolean).join(" · ") || null,
          at,
          status: failed ? "failed" : "ok",
          document_id: null,
          client_name: reminderClientId ? clientNameById.get(reminderClientId) ?? null : null,
          recipient,
          subject,
          file_name: null,
          note,
          channel: "email",
        });
      }

      // The event itself carries no client name or file name — only client_id and
      // a source_id that may no longer point at a live document — so both are
      // resolved in one batch rather than per row.
      const eventRows = documentRows as any[];
      const eventSourceIds = [...new Set(
        eventRows.filter((row) => row.source_type === "document" && row.source_id).map((row) => String(row.source_id)),
      )];
      const eventDocuments = eventSourceIds.length
        ? await col("documents").find({_id: {$in: eventSourceIds.map(tryObjectId)}} as any, {projection: {file_name: 1}}).toArray()
        : [];
      const documentNameById = new Map((eventDocuments as any[]).map((d) => [String(d._id), d.file_name as string | undefined]));

      for (const row of eventRows) {
        const at = isoDate(row.event_date) ?? isoDate(row.created_at);
        if (!at) continue;
        const documentId = row.source_type === "document" && row.source_id ? String(row.source_id) : null;
        const clientName = clientNameById.get(String(row.client_id ?? ""));
        const fileName = documentId ? documentNameById.get(documentId) : undefined;
        // description is sometimes an object rather than a string in older rows.
        const description = typeof row.description === "string" ? row.description : null;
        entries.push({
          id: String(row._id),
          kind: "document",
          title: typeof row.title === "string" && row.title.trim() ? row.title : "מסמך נוסף",
          detail: [clientName, fileName, description].filter((part) => typeof part === "string" && part.trim()).join(" · ") || null,
          at,
          status: "info",
          // Only set when the source document still exists, so the client never
          // links to a row that 404s.
          document_id: fileName !== undefined ? documentId : null,
          client_name: clientName ?? null,
          recipient: null,
          subject: null,
          file_name: fileName ?? null,
          note: description,
          channel: "system",
        });
      }

      entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
      res.json({rows: entries.slice(0, limit)});
    } catch (err) {
      res.status(500).json({error: err instanceof Error ? err.message : "Internal error"});
    }
  });
}
