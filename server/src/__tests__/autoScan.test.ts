import { describe, expect, it } from "vitest";
import {
  INVOICE_SCAN_WINDOW_DAYS,
  invoiceImportDigest,
  limitQueryToRecentDays,
  normalizeScanFrequency,
  scanDue,
  scanIntervalDays,
} from "../gmail/autoScan";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-10-10T12:00:00Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);

describe("scan frequency", () => {
  it("accepts daily and weekly and falls back for anything else", () => {
    expect(normalizeScanFrequency("daily")).toBe("daily");
    expect(normalizeScanFrequency("weekly")).toBe("weekly");
    expect(normalizeScanFrequency("hourly")).toBe("weekly");
    expect(normalizeScanFrequency(undefined)).toBe("weekly");
    expect(normalizeScanFrequency(null, "daily")).toBe("daily");
  });

  it("daily is shorter than a day so an hourly tick never skips a calendar day", () => {
    expect(scanIntervalDays("daily")).toBeLessThan(1);
    expect(scanIntervalDays("daily")).toBeGreaterThan(0.5);
    expect(scanIntervalDays("weekly")).toBe(7);
  });
});

describe("scanDue", () => {
  it("is due when never scanned or the date is unreadable", () => {
    expect(scanDue(null, NOW, "daily")).toBe(true);
    expect(scanDue(undefined, NOW, "weekly")).toBe(true);
    expect(scanDue("not a date", NOW, "daily")).toBe(true);
  });

  it("daily: runs again after about a day but not within the same day", () => {
    expect(scanDue(ago(2), NOW, "daily")).toBe(false);
    expect(scanDue(ago(19), NOW, "daily")).toBe(false);
    expect(scanDue(ago(20), NOW, "daily")).toBe(true);
    expect(scanDue(ago(25), NOW, "daily")).toBe(true);
  });

  it("weekly: waits seven days", () => {
    expect(scanDue(ago(24 * 6), NOW, "weekly")).toBe(false);
    expect(scanDue(ago(24 * 7), NOW, "weekly")).toBe(true);
  });

  it("accepts ISO strings as stored", () => {
    expect(scanDue(ago(30).toISOString(), NOW, "daily")).toBe(true);
    expect(scanDue(ago(1).toISOString(), NOW, "daily")).toBe(false);
  });

  it("a user who switches weekly to daily is due as soon as the shorter interval has passed", () => {
    const last = ago(48);
    expect(scanDue(last, NOW, "weekly")).toBe(false);
    expect(scanDue(last, NOW, "daily")).toBe(true);
  });
});

describe("limitQueryToRecentDays", () => {
  it("replaces the plan's history window instead of adding to it", () => {
    expect(limitQueryToRecentDays("has:attachment filename:pdf newer_than:36m")).toBe(`has:attachment filename:pdf newer_than:${INVOICE_SCAN_WINDOW_DAYS}d`);
  });

  it("adds a window when there is none and honours a custom one", () => {
    expect(limitQueryToRecentDays("has:attachment", 3)).toBe("has:attachment newer_than:3d");
  });

  it("never produces a zero or negative window", () => {
    expect(limitQueryToRecentDays("x", 0)).toBe("x newer_than:1d");
    expect(limitQueryToRecentDays("x", -5)).toBe("x newer_than:1d");
  });

  it("removes every existing window, whatever its unit", () => {
    expect(limitQueryToRecentDays("a newer_than:2y newer_than:10d b")).toBe(`a b newer_than:${INVOICE_SCAN_WINDOW_DAYS}d`);
  });
});

describe("invoiceImportDigest", () => {
  it("words one and many differently in Hebrew and English", () => {
    expect(invoiceImportDigest(1).title).toContain("חשבונית חדשה");
    expect(invoiceImportDigest(4).title).toContain("4");
    expect(invoiceImportDigest(1, "en").title).toBe("1 new invoice imported from Gmail");
    expect(invoiceImportDigest(4, "en").title).toBe("4 new invoices imported from Gmail");
  });
});
