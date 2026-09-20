// Google Calendar client: token resolution plus the handful of Calendar API
// calls the sync needs. Mirrors the Gmail token helpers in routes/gmail.ts —
// tokens live on the user row and are refreshed lazily on expiry.
import { ObjectId } from "mongodb";
import { col } from "../db/db";
import { getSettings } from "../settings";
import { logger } from "../logger";

// Narrowest scope that fits this design: it can create secondary calendars and
// fully manage events on the ones this app created, and nothing else. Notably
// it does NOT grant calendarList.list, so the app calendar is found by the id
// we persist rather than by enumerating the user's calendars.
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
/** Default name for the secondary calendar the app owns, so we never write into
 * the user's primary. Users can override it per-account from profile settings —
 * see calendarNameForUser. */
export const APP_CALENDAR_SUMMARY = "תסקירים";

/** Longest name we accept, matching what Google's UI shows without truncating. */
export const MAX_CALENDAR_NAME_LENGTH = 100;

/**
 * Normalize a user-supplied calendar name. Returns null when the input is not a
 * usable name, so callers can fall back to the default rather than pushing an
 * empty summary to Google.
 */
export function normalizeCalendarName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CALENDAR_NAME_LENGTH);
}

/** The calendar name for a user: their override, else the app default. */
export function calendarNameForUser(user: { calendar_name?: unknown } | null | undefined): string {
  return normalizeCalendarName(user?.calendar_name) ?? APP_CALENDAR_SUMMARY;
}

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface GoogleCalendarEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  etag?: string;
  updated?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

async function refreshCalendarToken(user: any, userId: string): Promise<string | null> {
  if (!user.calendar_refresh_token) return null;
  const settings = getSettings();
  const clientId = settings.googleClientId;
  const clientSecret = settings.googleClientSecret;
  if (!clientId || !clientSecret) return null;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: String(user.calendar_refresh_token),
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) {
    logger.warn("calendar_token_refresh_failed", { user_id: userId, status: r.status });
    // 400 invalid_grant / 401 mean the refresh token itself is dead — revoked in
    // the Google account, or expired. Retrying will never succeed, so record the
    // connection as broken: resolveCalendarToken and /api/calendar/status both
    // read this flag, so the app stops reporting a calendar that cannot sync and
    // can prompt the user to reconnect. Other statuses are left alone, since a
    // 5xx or a network blip is worth retrying.
    if (r.status === 400 || r.status === 401) {
      await col("users").updateOne(
        { _id: new ObjectId(userId) } as any,
        { $set: { calendar_scope_granted: false, calendar_token_revoked_at: new Date() } },
      );
      logger.warn("calendar_connection_revoked", { user_id: userId, status: r.status });
    }
    return null;
  }
  const data = await r.json() as { access_token: string; expires_in: number };
  await col("users").updateOne(
    { _id: new ObjectId(userId) } as any,
    {
      $set: {
        calendar_access_token: data.access_token,
        calendar_token_expires_at: new Date(Date.now() + data.expires_in * 1000),
      },
    },
  );
  return data.access_token;
}

export async function resolveCalendarToken(userId: string): Promise<string | null> {
  const user = await col<any>("users").findOne({ _id: new ObjectId(userId) } as any);
  if (!user || user.calendar_scope_granted === false) return null;
  if (!user.calendar_access_token) return null;

  const expiresAt = user.calendar_token_expires_at ? new Date(user.calendar_token_expires_at) : null;
  if (expiresAt && expiresAt <= new Date()) {
    return refreshCalendarToken(user, userId);
  }
  return user.calendar_access_token;
}

export async function calendarFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${CALENDAR_API}/${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Find (or create) the app's own secondary calendar and cache its id on the
 * user. Writing to a dedicated calendar keeps the user's primary clean, and
 * calendar.app.created confines the grant to calendars this app made.
 */
export async function ensureAppCalendar(userId: string, accessToken: string): Promise<string | null> {
  const user = await col<any>("users").findOne({ _id: new ObjectId(userId) } as any);
  const storedId = user?.calendar_id ? String(user.calendar_id) : null;
  const calendarName = calendarNameForUser(user);

  // Confirm the stored calendar still exists — the user may have deleted it in
  // Google, in which case we create a fresh one rather than 404 on every push.
  if (storedId) {
    const getRes = await calendarFetch(accessToken, `calendars/${encodeURIComponent(storedId)}`);
    if (getRes.ok) {
      const current = await getRes.json().catch(() => null) as { summary?: string } | null;
      // Also the path that applies a rename from settings: the stored name is
      // the source of truth, so any drift from it is pushed back to Google.
      if (current?.summary !== calendarName) {
        await renameCalendar(accessToken, storedId, calendarName);
      }
      return storedId;
    }
    if (getRes.status !== 404 && getRes.status !== 410) {
      logger.warn("calendar_lookup_failed", { user_id: userId, status: getRes.status });
      return null;
    }
    logger.info("calendar_recreating", { user_id: userId, missing_calendar_id: storedId });
  }

  const createRes = await calendarFetch(accessToken, "calendars", {
    method: "POST",
    body: JSON.stringify({ summary: calendarName, timeZone: "Asia/Jerusalem" }),
  });
  if (!createRes.ok) {
    logger.warn("calendar_create_failed", { user_id: userId, status: createRes.status });
    return null;
  }
  const created = await createRes.json() as { id: string };
  await col("users").updateOne(
    { _id: new ObjectId(userId) } as any,
    { $set: { calendar_id: created.id, calendar_sync_token: null } },
  );
  // Links from a previous calendar point at event ids that no longer resolve,
  // so drop them and let the next push recreate the events on the new calendar.
  if (storedId) await col("calendar_links").deleteMany({ user_id: userId });
  logger.info("calendar_created", { user_id: userId, calendar_id: created.id });
  return created.id;
}

/** Push a new title to Google. Returns whether the rename landed. */
export async function renameCalendar(
  accessToken: string,
  calendarId: string,
  summary: string,
): Promise<boolean> {
  const res = await calendarFetch(accessToken, `calendars/${encodeURIComponent(calendarId)}`, {
    method: "PATCH",
    body: JSON.stringify({ summary }),
  });
  if (!res.ok) {
    logger.warn("calendar_rename_failed", { calendar_id: calendarId, status: res.status });
    return false;
  }
  return true;
}

export async function insertEvent(accessToken: string, calendarId: string, event: GoogleCalendarEvent) {
  const res = await calendarFetch(accessToken, `calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`calendar insert failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<GoogleCalendarEvent>;
}

export async function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: GoogleCalendarEvent,
) {
  const res = await calendarFetch(
    accessToken,
    `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(event) },
  );
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`calendar patch failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<GoogleCalendarEvent>;
}

export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const res = await calendarFetch(
    accessToken,
    `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  // 404/410 mean the user already removed it — the desired end state either way.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`calendar delete failed: ${res.status}`);
  }
}

/**
 * Incremental list. Returns the events changed since `syncToken`, plus the next
 * token to store. A 410 means the token expired and the caller must do a full
 * resync — signalled by `expired`.
 */
export async function listEventChanges(
  accessToken: string,
  calendarId: string,
  syncToken: string | null,
): Promise<{ events: GoogleCalendarEvent[]; nextSyncToken: string | null; expired: boolean }> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;

  do {
    const params = new URLSearchParams({ maxResults: "250", showDeleted: "true" });
    if (syncToken) params.set("syncToken", syncToken);
    else params.set("timeMin", new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString());
    if (pageToken) params.set("pageToken", pageToken);

    const res = await calendarFetch(
      accessToken,
      `calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    );
    if (res.status === 410) return { events: [], nextSyncToken: null, expired: true };
    if (!res.ok) throw new Error(`calendar list failed: ${res.status}`);

    const page = await res.json() as {
      items?: GoogleCalendarEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? null;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken, expired: false };
}
