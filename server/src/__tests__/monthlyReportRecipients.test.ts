import {describe, expect, it} from "vitest";
import {
  isMonthlyReportDue,
  monthlyReportMonthKey,
  parseRecipientList,
  resolveAccountReportRecipients,
  uniqueEmails,
} from "../reports/monthlyReportRecipients.js";

describe("resolveAccountReportRecipients", () => {
  it("uses the app user email only when recipients are empty", () => {
    expect(resolveAccountReportRecipients({
      configuredRecipients: "",
      accountEmail: "owner@example.com",
    })).toEqual(["owner@example.com"]);
  });

  it("uses configured recipients without forcing the account email", () => {
    expect(resolveAccountReportRecipients({
      configuredRecipients: "a@x.com; B@Y.com",
      accountEmail: "owner@example.com",
    })).toEqual(["a@x.com", "b@y.com"]);
  });

  it("never invents client emails from empty inputs", () => {
    expect(resolveAccountReportRecipients({
      configuredRecipients: null,
      accountEmail: null,
    })).toEqual([]);
  });

  it("normalizes and dedupes addresses", () => {
    expect(uniqueEmails([" A@X.com ", "a@x.com", "", null])).toEqual(["a@x.com"]);
    expect(parseRecipientList("one@x.com, two@x.com  three@x.com")).toEqual([
      "one@x.com",
      "two@x.com",
      "three@x.com",
    ]);
  });
});

describe("isMonthlyReportDue", () => {
  it("waits until the configured day and hour", () => {
    const before = new Date(2026, 7, 15, 7, 0, 0); // Aug 15 07:00 local
    expect(isMonthlyReportDue({ now: before, day: 15, hour: 8, lastSent: null })).toBe(false);

    const atHour = new Date(2026, 7, 15, 8, 0, 0);
    expect(isMonthlyReportDue({ now: atHour, day: 15, hour: 8, lastSent: null })).toBe(true);
  });

  it("skips when already sent this month", () => {
    const now = new Date(2026, 7, 20, 10, 0, 0);
    const key = monthlyReportMonthKey(now);
    expect(isMonthlyReportDue({
      now,
      day: 1,
      hour: 0,
      lastSent: `${key} (2026-08-01T08:00:00.000Z)`,
    })).toBe(false);
  });

  it("allows a later month after a prior send", () => {
    const now = new Date(2026, 8, 1, 9, 0, 0); // Sep
    expect(isMonthlyReportDue({
      now,
      day: 1,
      hour: 8,
      lastSent: "2026-08 (2026-08-15T08:00:00.000Z)",
    })).toBe(true);
  });
});
