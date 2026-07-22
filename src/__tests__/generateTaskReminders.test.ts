import {describe, expect, it} from "vitest";

// ── pure-logic mirror of generateTaskReminders (DB-free, like the contract test) ─

function isValidDue(dueDate: string | null): boolean {
  return !!dueDate && /^\d{4}-\d{2}-\d{2}/.test(dueDate);
}

function taskLabel(description: string): string {
  return description.trim().slice(0, 60) || "משימה";
}

function buildTaskTitle(description: string, dueDate: string): string {
  return `משימה: ${taskLabel(description)} (יעד: ${dueDate})`;
}

function triggerDate(dueIso: string, advanceDays: number, today: string): string {
  const d = new Date(dueIso);
  d.setDate(d.getDate() - advanceDays);
  const calc = d.toISOString().slice(0, 10);
  return calc < today ? today : calc;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("generateTaskReminders — due-date validation", () => {
  it("rejects null due dates", () => {
    expect(isValidDue(null)).toBe(false);
  });
  it("rejects free-text due dates", () => {
    expect(isValidDue("בקרוב")).toBe(false);
  });
  it("accepts ISO due dates", () => {
    expect(isValidDue("2026-09-01")).toBe(true);
  });
});

describe("generateTaskReminders — label derivation", () => {
  it("uses the description as the label", () => {
    expect(taskLabel("חידוש רישיון עסק")).toBe("חידוש רישיון עסק");
  });
  it("trims whitespace", () => {
    expect(taskLabel("  לבדוק מסמך  ")).toBe("לבדוק מסמך");
  });
  it("truncates very long descriptions to 60 chars", () => {
    const long = "א".repeat(100);
    expect(taskLabel(long)).toHaveLength(60);
  });
  it("falls back to 'משימה' for an empty description", () => {
    expect(taskLabel("   ")).toBe("משימה");
  });
});

describe("generateTaskReminders — title format", () => {
  it("includes label and target date", () => {
    expect(buildTaskTitle("לחדש ביטוח", "2026-12-01")).toBe(
      "משימה: לחדש ביטוח (יעד: 2026-12-01)"
    );
  });
});

describe("generateTaskReminders — trigger date calculation", () => {
  it("subtracts advance days from the due date", () => {
    expect(triggerDate("2026-12-01", 14, "2026-01-01")).toBe("2026-11-17");
  });
  it("clamps a past advance-trigger to today", () => {
    // due in 3 days, but a 30-day advance trigger is already past → today
    expect(triggerDate("2026-06-19", 30, "2026-06-16")).toBe("2026-06-16");
  });
});
