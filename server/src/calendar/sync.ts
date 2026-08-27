// Two-way sync between app reminders and the user's Google Calendar.
//
// Outbound: every pending reminder becomes an all-day event on the app's own
// secondary calendar. Inbound: date moves and deletions made in Google are
// pulled back onto the reminder.
//
// Conflict rule: the app wins on trigger_date unless the Google event was
// updated more recently than our last push. Events we did not create are
// ignored entirely — matching is by the extendedProperties stamp below, never
// by title or date.
import { ObjectId } from "mongodb";
import { createHash } from "crypto";
import { col } from "../db/db";
import { logger } from "../logger";
import {
  deleteEvent,
  ensureAppCalendar,
  insertEvent,
  listEventChanges,
  patchEvent,
  resolveCalendarToken,
  type GoogleCalendarEvent,
} from "./googleCalendar";

const SOURCE_TYPE = "reminder";
const PROP_SOURCE_TYPE = "reminderAppSourceType";
const PROP_SOURCE_ID = "reminderAppSourceId";
const EVENT_SUMMARY_PREFIX = "תסקיר לא בתוקף";

/** Reminder statuses worth putting on a calendar. */
const SYNCABLE_STATUSES = ["pending", "snoozed"];

function toObjectId(value: unknown): any {
  try { return new ObjectId(String(value)); } catch { return value; }
}

export function addDays(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return dt.toISOString().slice(0, 10);
}

export function eventDateOf(event: GoogleCalendarEvent): string | null {
  const raw = event.start?.date ?? event.start?.dateTime ?? null;
  return raw ? raw.slice(0, 10) : null;
}

function describeReminder(reminder: any): string {
  const lines: string[] = [];
  const companyName = companyNameForReminder(reminder);
  const clientFields: Array<[string, unknown]> = [
    ["לקוח", companyName],
    ["איש קשר", reminder.contact_person],
    ["אימייל", reminder.client_email ?? reminder.contact_email ?? firstReminderEmail(reminder.email_to)],
    ["טלפון", reminder.client_phone ?? reminder.contact_phone],
    ["מספר חוזה", reminder.contract_number],
    ["סוג", reminder.contract_type],
  ];
  const equipmentFields: Array<[string, unknown]> = [
    ["יצרן", reminder.manufacturer],
    ["דגם", reminder.model],
    ["מספר סידורי", reminder.serial_number],
    ["מספר רישוי", reminder.license_number],
  ];
  for (const [label, value] of [...clientFields, ...equipmentFields]) {
    const text = String(value ?? "").trim();
    if (text) lines.push(`${label}: ${text}`);
  }
  if (reminder.title) lines.push(`תזכורת: ${reminder.title}`);
  if (reminder.body) lines.push(String(reminder.body));
  return lines.join("\n");
}

function buildEventSummary(reminder: any): string {
  const companyName = companyNameForReminder(reminder);
  return companyName ? `${EVENT_SUMMARY_PREFIX} - ${companyName}` : EVENT_SUMMARY_PREFIX;
}

export function buildEvent(reminder: any): GoogleCalendarEvent {
  const date = String(reminder.trigger_date ?? "").slice(0, 10);
  return {
    summary: buildEventSummary(reminder),
    description: describeReminder(reminder),
    // All-day events are half-open in the Calendar API: end is the day after.
    start: { date },
    end: { date: addDays(date, 1) },
    extendedProperties: {
      private: {
        [PROP_SOURCE_TYPE]: SOURCE_TYPE,
        [PROP_SOURCE_ID]: String(reminder._id),
      },
    },
  };
}

/** Fingerprint of what we last pushed, so unchanged reminders skip the API. */
export function payloadHash(event: GoogleCalendarEvent): string {
  return createHash("sha1")
    .update(JSON.stringify([event.summary, event.description, event.start?.date]))
    .digest("hex");
}

/**
 * Conflict rule: a remote date change is only applied when Google's copy was
 * touched after our last push. Without a recorded push we trust the remote
 * value, since the event can only have come from a user edit.
 */
export function remoteChangeWins(
  remoteUpdated: string | Date | null,
  lastSyncedAt: string | Date | null,
): boolean {
  if (!lastSyncedAt || !remoteUpdated) return true;
  return new Date(remoteUpdated) > new Date(lastSyncedAt);
}

/** True when the event carries this app's ownership stamp. */
export function isAppOwnedEvent(event: GoogleCalendarEvent): boolean {
  return event.extendedProperties?.private?.[PROP_SOURCE_TYPE] === SOURCE_TYPE;
}

export function reminderIdOfEvent(event: GoogleCalendarEvent): string | null {
  if (!isAppOwnedEvent(event)) return null;
  return event.extendedProperties?.private?.[PROP_SOURCE_ID] ?? null;
}

async function linkFor(userId: string, reminderId: string) {
  return col<any>("calendar_links").findOne({
    user_id: userId,
    source_type: SOURCE_TYPE,
    source_id: reminderId,
  });
}

/**
 * Push one reminder to Google. Safe to call on every reminder write — it no-ops
 * when the user has not connected a calendar or nothing changed.
 */
export async function pushReminderToCalendar(userId: string, reminderId: string): Promise<void> {
  const accessToken = await resolveCalendarToken(userId);
  if (!accessToken) return;
  const calendarId = await ensureAppCalendar(userId, accessToken);
  if (!calendarId) return;

  const reminder = await col<any>("reminders").findOne({ _id: toObjectId(reminderId) });
  const link = await linkFor(userId, reminderId);

  // Gone, dismissed or sent: remove the event so the calendar matches the app.
  if (!reminder || !SYNCABLE_STATUSES.includes(String(reminder.status))) {
    if (link?.gcal_event_id) {
      await deleteEvent(accessToken, calendarId, link.gcal_event_id);
      await col("calendar_links").deleteOne({ _id: link._id });
    }
    return;
  }

  const event = buildEvent(await reminderWithCalendarSnapshot(reminder, userId));
  const hash = payloadHash(event);
  if (link?.last_pushed_hash === hash && link.gcal_event_id) return;

  try {
    if (link?.gcal_event_id) {
      const patched = await patchEvent(accessToken, calendarId, link.gcal_event_id, event);
      if (patched) {
        await col("calendar_links").updateOne(
          { _id: link._id },
          { $set: { last_pushed_hash: hash, etag: patched.etag ?? null, last_synced_at: new Date() } },
        );
        return;
      }
      // The user deleted the event in Google — drop the stale link and re-insert.
      await col("calendar_links").deleteOne({ _id: link._id });
    }

    const created = await insertEvent(accessToken, calendarId, event);
    await col("calendar_links").updateOne(
      { user_id: userId, source_type: SOURCE_TYPE, source_id: reminderId },
      {
        $set: {
          user_id: userId,
          source_type: SOURCE_TYPE,
          source_id: reminderId,
          gcal_calendar_id: calendarId,
          gcal_event_id: created.id ?? null,
          etag: created.etag ?? null,
          last_pushed_hash: hash,
          last_synced_at: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (e) {
    logger.warn("calendar_push_failed", { user_id: userId, reminder_id: reminderId, error: String(e) });
  }
}

function firstReminderEmail(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.find((item) => typeof item === "string" && item.trim())?.trim() ?? null;
    }
  } catch {
    // Older reminders may store a plain email string.
  }
  return value.includes("@") ? value.trim() : null;
}

async function reminderWithCalendarSnapshot(reminder: any, userId: string): Promise<any> {
  const missingClientData = !companyNameForReminder(reminder)
    || !textField(reminder.contact_person)
    || !textField(reminder.client_email)
    || !textField(reminder.client_phone)
    || !textField(reminder.contract_number)
    || !textField(reminder.contract_type);
  if (!missingClientData) return reminder;

  const contract = await resolveReminderContract(reminder, userId);
  const document = reminder.document_id
    ? await col<any>("documents").findOne({ _id: toObjectId(reminder.document_id), user_id: userId })
    : contract?.document_id
      ? await col<any>("documents").findOne({ _id: toObjectId(contract.document_id), user_id: userId })
      : null;
  const client = await resolveReminderClient(reminder, contract, userId);
  const fields = calendarFieldsFromSources(contract, document);
  const patch: Record<string, string> = {};

  const setMissing = (key: string, value: unknown) => {
    if (textField(reminder[key])) return;
    const text = textField(value);
    if (text) patch[key] = text;
  };

  setMissing("client_company", clientDisplayName(client?.display_name) ?? fields.client_company);
  setMissing("client_name", fields.client_name);
  setMissing("contact_person", client?.contact_person ?? fields.contact_person);
  setMissing("client_email", client?.email ?? fields.contact_email ?? firstReminderEmail(reminder.email_to));
  setMissing("client_phone", client?.phone ?? fields.contact_phone);
  setMissing("contract_number", contract?.contract_number);
  setMissing("contract_type", contract?.contract_type);

  if (!Object.keys(patch).length) return reminder;
  await col("reminders").updateOne(
    { _id: reminder._id, user_id: userId },
    { $set: { ...patch, updated_at: new Date() } },
  );
  return { ...reminder, ...patch };
}

async function resolveReminderContract(reminder: any, userId: string): Promise<any | null> {
  if (!reminder.source_id) return null;
  if (!["contract_expiry", "manual"].includes(String(reminder.source_type))) return null;
  const sourceId = String(reminder.source_id);
  return col<any>("contracts").findOne({
    user_id: userId,
    $or: [
      { _id: toObjectId(sourceId) },
      { id: sourceId },
    ],
  });
}

async function resolveReminderClient(reminder: any, contract: any, userId: string): Promise<any | null> {
  const clientId = reminder.client_id ?? contract?.client_id;
  if (!clientId) return null;
  return col<any>("clients").findOne({
    _id: toObjectId(String(clientId)),
    user_id: userId,
  });
}

function calendarFieldsFromSources(contract: any, document: any): {
  client_company: string | null;
  client_name: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
} {
  const contractFields = parseObject(contract?.manual_fields);
  const documentFields = parseObject(document?.extracted_fields);
  return {
    client_company: textField(documentFields?.client_company),
    client_name: textField(documentFields?.client_name),
    contact_person: textField(contractFields?.contact_person) ?? textField(documentFields?.contact_person) ?? textField(documentFields?.client_name),
    contact_email: textField(contractFields?.contact_email) ?? textField(contractFields?.client_email) ?? textField(documentFields?.contact_email) ?? textField(documentFields?.client_email) ?? textField(documentFields?.email),
    contact_phone: textField(contractFields?.contact_phone) ?? textField(documentFields?.contact_phone) ?? textField(documentFields?.client_phone) ?? textField(documentFields?.phone),
  };
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function textField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clientDisplayName(value: unknown): string | null {
  const text = textField(value);
  if (!text) return null;
  return text.replace(/\s+/g, " ");
}

function companyNameForReminder(reminder: any): string | null {
  return clientDisplayName(reminder.client_company)
    ?? clientDisplayName(reminder.company_name)
    ?? clientDisplayName(reminder.client_name)
    ?? clientDisplayName(reminder.counterparty);
}

/** Push every syncable reminder for a user. Used on first connect. */
export async function pushAllReminders(userId: string): Promise<number> {
  const reminders = await col<any>("reminders")
    .find({ user_id: userId, status: { $in: SYNCABLE_STATUSES } })
    .limit(500)
    .toArray();
  for (const reminder of reminders) {
    await pushReminderToCalendar(userId, String(reminder._id));
  }
  return reminders.length;
}

/**
 * Pull changes made in Google back into the app. Only events carrying our
 * extendedProperties stamp are considered — anything else on the calendar is
 * the user's own and must be left alone.
 */
export async function pullCalendarChanges(userId: string): Promise<{ updated: number; cancelled: number }> {
  const accessToken = await resolveCalendarToken(userId);
  if (!accessToken) return { updated: 0, cancelled: 0 };
  const calendarId = await ensureAppCalendar(userId, accessToken);
  if (!calendarId) return { updated: 0, cancelled: 0 };

  const user = await col<any>("users").findOne({ _id: toObjectId(userId) });
  const storedToken = user?.calendar_sync_token ? String(user.calendar_sync_token) : null;

  let result = await listEventChanges(accessToken, calendarId, storedToken);
  if (result.expired) {
    logger.info("calendar_sync_token_expired", { user_id: userId });
    result = await listEventChanges(accessToken, calendarId, null);
  }

  let updated = 0;
  let cancelled = 0;

  for (const event of result.events) {
    const reminderId = reminderIdOfEvent(event);
    if (!reminderId) continue;

    const link = await linkFor(userId, reminderId);
    const reminder = await col<any>("reminders").findOne({ _id: toObjectId(reminderId), user_id: userId });
    if (!reminder) continue;

    if (event.status === "cancelled") {
      await col("reminders").updateOne(
        { _id: reminder._id },
        { $set: { status: "dismissed", updated_at: new Date() } },
      );
      if (link) await col("calendar_links").deleteOne({ _id: link._id });
      cancelled += 1;
      continue;
    }

    const remoteDate = eventDateOf(event);
    if (!remoteDate || remoteDate === String(reminder.trigger_date ?? "").slice(0, 10)) continue;

    if (!remoteChangeWins(event.updated ?? null, link?.last_synced_at ?? null)) continue;

    await col("reminders").updateOne(
      { _id: reminder._id },
      { $set: { trigger_date: remoteDate, updated_at: new Date() } },
    );
    if (link) {
      await col("calendar_links").updateOne(
        { _id: link._id },
        { $set: { last_synced_at: new Date(), etag: event.etag ?? null } },
      );
    }
    updated += 1;
  }

  if (result.nextSyncToken) {
    await col("users").updateOne(
      { _id: toObjectId(userId) },
      { $set: { calendar_sync_token: result.nextSyncToken } },
    );
  }

  if (updated || cancelled) {
    logger.info("calendar_pull_applied", { user_id: userId, updated, cancelled });
  }
  return { updated, cancelled };
}

/** Scheduler entry point: pull for every user with a connected calendar. */
export async function syncAllCalendars(): Promise<void> {
  const users = await col<any>("users")
    .find({ calendar_access_token: { $exists: true, $ne: "" }, calendar_scope_granted: { $ne: false } })
    .project({ _id: 1 })
    .toArray();
  for (const user of users) {
    try {
      await pullCalendarChanges(String(user._id));
    } catch (e) {
      logger.warn("calendar_sync_user_failed", { user_id: String(user._id), error: String(e) });
    }
  }
}
