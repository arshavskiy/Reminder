// Builds a read-only iCalendar (.ics) feed from a user's open reminders, so any
// calendar app (Apple, Outlook, Thunderbird) can subscribe by URL.
//
// Pure functions only: the route loads reminders and hands plain items in. The
// feed deliberately carries a title and an optional contract number and nothing
// else: calendar apps cache subscribed feeds, so client emails and phone
// numbers must not leave the app this way.

export interface IcsFeedItem {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, Asia/Jerusalem. Absent for all-day items. */
  time?: string | null;
  summary: string;
  contractNumber?: string | null;
}

const CRLF = "\r\n";
const TIME_ZONE = "Asia/Jerusalem";
const PROD_ID = "-//RemindOCR//Reminders//HE";

/** RFC 5545 section 3.3.11: escape backslash, semicolon, comma and newlines. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line to at most 75 octets, never splitting a UTF-8 character. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  // Continuation lines start with one space, which counts toward the 75.
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += bytes;
  }
  if (current) parts.push(current);
  return parts.join(`${CRLF} `);
}

function compactDate(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function nextDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Offset of Asia/Jerusalem from UTC in minutes at the given instant (DST-aware). */
function jerusalemOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((local - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** Converts a Jerusalem wall-clock date and time to a UTC instant. */
export function jerusalemToUtc(isoDate: string, time: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = jerusalemOffsetMinutes(guess);
  const result = new Date(guess.getTime() - offset * 60000);
  // Re-check once: the offset at the corrected instant can differ across a DST change.
  const corrected = jerusalemOffsetMinutes(result);
  return corrected === offset ? result : new Date(guess.getTime() - corrected * 60000);
}

export function buildIcsFeed(items: IcsFeedItem[], options: { calendarName: string; now?: Date }): string {
  const stamp = utcStamp(options.now ?? new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PROD_ID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
    `X-WR-TIMEZONE:${TIME_ZONE}`,
    // Hint for clients that honour it; others fall back to their own interval.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const item of items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue;
    lines.push("BEGIN:VEVENT", `UID:reminder-${item.id}@remindocr.com`, `DTSTAMP:${stamp}`);
    if (item.time && /^\d{2}:\d{2}$/.test(item.time)) {
      const start = jerusalemToUtc(item.date, item.time);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(item.date)}`, `DTEND;VALUE=DATE:${compactDate(nextDay(item.date))}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(item.summary)}`);
    if (item.contractNumber) lines.push(`DESCRIPTION:${escapeIcsText(`מספר חוזה: ${item.contractNumber}`)}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
