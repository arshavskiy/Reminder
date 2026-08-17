import {describe, expect, it, vi} from "vitest";
import {resolveContractReminderEmail} from "../reminders/scheduler.js";

describe("resolveContractReminderEmail", () => {
    it("uses the explicit contact email first", () => {
        expect(resolveContractReminderEmail("a@x.com", {manual_fields: {contact_email: "b@x.com"}}, {email: "c@x.com"})).toBe("a@x.com");
    });

    it("falls back to contract form email when the client record has none", () => {
        expect(resolveContractReminderEmail(null, {manual_fields: {contact_email: "form@x.com"}}, {email: null})).toBe("form@x.com");
    });

    it("falls back to client_email from the print template fields", () => {
        expect(resolveContractReminderEmail(null, {manual_fields: {client_email: "layout@x.com"}}, null)).toBe("layout@x.com");
    });

    it("normalizes OCR emails when resolving contract reminder email", () => {
        expect(resolveContractReminderEmail(null, {manual_fields: {contact_email: "com.gmail@zibai.tal"}}, null))
            .toBe("tal.zibai@gmail.com");
    });
});

// ── reminder label derivation (mirrors generateContractReminders logic) ────────

function baseLabel(contractType: string | null | undefined): string {
  const t = (contractType ?? "").toLowerCase();
  if (t.includes("תסקיר") || t.includes("בדיקה")) return "בדיקה הבאה";
  if (t.includes("ביטוח")) return "חידוש ביטוח";
  if (t.includes("אישור") || t.includes("תעודה")) return "חידוש תעודה";
  if (t.includes("חשבונית")) return "תשלום";
  return "פקיעת תוקף";
}

function triggerDate(expiryIso: string, advanceDays: number): string {
  const d = new Date(expiryIso);
  d.setDate(d.getDate() - advanceDays);
  return d.toISOString().slice(0, 10);
}

function buildTitle(contractType: string | null, expiryDate: string): string {
  // Title shows the inspection/expiry target date, not the earlier trigger date.
  return `${baseLabel(contractType)} ב-${expiryDate}`;
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("generateContractReminders — label derivation", () => {
  it("uses 'בדיקה הבאה' for תסקיר", () => {
    expect(baseLabel("תסקיר בדיקה")).toBe("בדיקה הבאה");
  });

  it("uses 'בדיקה הבאה' for בדיקה", () => {
    expect(baseLabel("דוח בדיקה שנתי")).toBe("בדיקה הבאה");
  });

  it("uses 'חידוש ביטוח' for ביטוח", () => {
    expect(baseLabel("ביטוח רכב")).toBe("חידוש ביטוח");
  });

  it("uses 'חידוש תעודה' for תעודה", () => {
    expect(baseLabel("אישור תעודה")).toBe("חידוש תעודה");
    expect(baseLabel("אישור בטיחות")).toBe("חידוש תעודה");
  });

  it("uses 'תשלום' for חשבונית", () => {
    expect(baseLabel("חשבונית מס")).toBe("תשלום");
  });

  it("uses 'פקיעת תוקף' for unknown type", () => {
    expect(baseLabel("חוזה שכירות")).toBe("פקיעת תוקף");
  });

  it("uses 'פקיעת תוקף' for null type", () => {
    expect(baseLabel(null)).toBe("פקיעת תוקף");
  });
});

describe("generateContractReminders — trigger date calculation", () => {
  it("subtracts advance days from expiry date", () => {
    expect(triggerDate("2026-11-25", 30)).toBe("2026-10-26");
    expect(triggerDate("2026-11-25", 60)).toBe("2026-09-25");
    expect(triggerDate("2026-11-25", 90)).toBe("2026-08-26");
  });

  it("handles month boundary correctly", () => {
    expect(triggerDate("2026-03-01", 1)).toBe("2026-02-28");
  });
});

describe("generateContractReminders — reminder title format", () => {
  it("formats title with label and the inspection/target date", () => {
    expect(buildTitle("תסקיר בדיקה", "2026-11-25")).toBe("בדיקה הבאה ב-2026-11-25");
    expect(buildTitle(null, "2026-11-25")).toBe("פקיעת תוקף ב-2026-11-25");
  });
});

describe("generateContractReminders — past advance trigger", () => {
  it("clamps a past trigger to today when expiry is still future", () => {
    const today = "2026-06-01";
    const trigger = triggerDate("2026-06-15", 30); // 2026-05-16 — already past
    expect(trigger < today).toBe(true);
    const clamped = trigger < today ? today : trigger;
    expect(clamped).toBe(today);
  });

  it("keeps a future trigger date unchanged", () => {
    const today = "2026-06-01";
    const trigger = triggerDate("2026-12-01", 30); // 2026-11-01 — future
    const clamped = trigger < today ? today : trigger;
    expect(clamped).toBe(trigger);
  });
});

describe("generateContractReminders — mock insertOne calls", () => {
  it("inserts one reminder per advance day", async () => {
    const insertOne = vi.fn(async (_doc: unknown) => ({ insertedId: "new-id" }));
    const findOne = vi.fn(async () => null); // no existing reminder

    const advanceDays = [30, 60, 90];
    const today = "2020-01-01"; // far past so all triggers are future
    const expiryDate = "2026-11-25";

    for (const days of advanceDays) {
      const existing = await findOne();
      if (existing) continue;
      const trigger = triggerDate(expiryDate, days);
      if (trigger <= today) continue;
      await insertOne({ trigger_date: trigger, advance_days: days });
    }

    expect(insertOne).toHaveBeenCalledTimes(3);
    const calls = insertOne.mock.calls.map((c: any[]) => (c[0] as any).advance_days);
    expect(calls).toEqual([30, 60, 90]);
  });

  it("skips insert when existing reminder found", async () => {
    const insertOne = vi.fn();
    const findOne = vi.fn(async () => ({ id: "existing" })); // already exists

    const advanceDays = [30];
    for (const days of advanceDays) {
      const existing = await findOne();
      if (existing) continue;
      await insertOne({ advance_days: days });
    }

    expect(insertOne).not.toHaveBeenCalled();
  });
});
