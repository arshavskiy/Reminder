import { describe, expect, it } from "vitest";
import { buildIcsFeed, escapeIcsText, foldIcsLine, jerusalemToUtc } from "../calendar/icsFeed";

const NOW = new Date("2026-10-01T08:00:00Z");

describe("escapeIcsText", () => {
  it("escapes separators and newlines", () => {
    expect(escapeIcsText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
  });
});

describe("foldIcsLine", () => {
  it("leaves short lines alone", () => {
    expect(foldIcsLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds long lines to 75 octets without splitting a character", () => {
    const line = `SUMMARY:${"תסקיר ".repeat(30)}`;
    const folded = foldIcsLine(line);
    const encoder = new TextEncoder();
    for (const part of folded.split("\r\n")) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    }
    // Unfolding restores the original exactly.
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});

describe("jerusalemToUtc", () => {
  it("applies the winter offset (UTC+2)", () => {
    expect(jerusalemToUtc("2026-01-15", "09:30").toISOString()).toBe("2026-01-15T07:30:00.000Z");
  });

  it("applies the summer offset (UTC+3)", () => {
    expect(jerusalemToUtc("2026-07-15", "09:30").toISOString()).toBe("2026-07-15T06:30:00.000Z");
  });
});

describe("buildIcsFeed", () => {
  it("wraps events in a calendar with CRLF line endings", () => {
    const ics = buildIcsFeed([{ id: "abc", date: "2026-10-05", summary: "תסקיר" }], { calendarName: "RemindOCR", now: NOW });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:reminder-abc@remindocr.com");
    expect(ics).toContain("DTSTAMP:20261001T080000Z");
  });

  it("writes all-day events as a half-open date range", () => {
    const ics = buildIcsFeed([{ id: "1", date: "2026-10-31", summary: "x" }], { calendarName: "c", now: NOW });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261031");
    expect(ics).toContain("DTEND;VALUE=DATE:20261101");
  });

  it("writes timed events in UTC with a one hour duration", () => {
    const ics = buildIcsFeed([{ id: "1", date: "2026-07-15", time: "09:30", summary: "x" }], { calendarName: "c", now: NOW });
    expect(ics).toContain("DTSTART:20260715T063000Z");
    expect(ics).toContain("DTEND:20260715T073000Z");
  });

  it("keeps the UID stable across builds", () => {
    const item = { id: "same", date: "2026-10-05", summary: "x" };
    const first = buildIcsFeed([item], { calendarName: "c", now: NOW });
    const second = buildIcsFeed([item], { calendarName: "c", now: new Date("2026-10-02T00:00:00Z") });
    expect(first.match(/UID:.*/)?.[0]).toBe(second.match(/UID:.*/)?.[0]);
  });

  it("skips items with an invalid date and exposes only title and contract number", () => {
    const ics = buildIcsFeed([
      { id: "bad", date: "soon", summary: "bad" },
      { id: "ok", date: "2026-10-05", summary: "ok", contractNumber: "484590/1" },
    ], { calendarName: "c", now: NOW });
    expect(ics).not.toContain("reminder-bad@");
    expect(ics).toContain("DESCRIPTION:");
    expect(ics).not.toMatch(/@gmail|PHONE|ATTENDEE|ORGANIZER|TEL/i);
  });
});
