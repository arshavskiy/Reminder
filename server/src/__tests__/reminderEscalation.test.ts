import {describe, expect, it} from "vitest";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeReminder(id: string, triggerDate: string, status = "pending") {
  return { _id: { toString: () => id }, id, trigger_date: triggerDate, title: "test", status };
}

function makeLog(reminderId: string) {
  return { reminder_id: reminderId, log_type: "escalation" };
}

// Extracted escalation logic (mirrors checkEscalations in scheduler.ts)
async function runEscalationLogic(
  overdue: any[],
  existingLogs: any[],
  onSend: (remId: string) => void
) {
  const escalatedIds = new Set(existingLogs.map((l: any) => l.reminder_id));
  for (const reminder of overdue) {
    const remId = reminder._id?.toString();
    if (escalatedIds.has(remId)) continue;
    onSend(remId);
  }
}

describe("Reminder Escalation — skip already-escalated reminders", () => {
  it("does not send escalation when log entry already exists", async () => {
    const sent: string[] = [];
    const overdue = [makeReminder("r1", "2026-01-01")];
    const logs = [makeLog("r1")];

    await runEscalationLogic(overdue, logs, (id) => sent.push(id));
    expect(sent).toHaveLength(0);
  });

  it("sends escalation for reminders with no log entry", async () => {
    const sent: string[] = [];
    const overdue = [
      makeReminder("r1", "2026-01-01"),
      makeReminder("r2", "2026-01-02"),
    ];
    const logs = [makeLog("r1")]; // only r1 already escalated

    await runEscalationLogic(overdue, logs, (id) => sent.push(id));
    expect(sent).toEqual(["r2"]);
  });

  it("sends all when no prior log entries", async () => {
    const sent: string[] = [];
    const overdue = [makeReminder("a", "2026-01-01"), makeReminder("b", "2026-01-02")];

    await runEscalationLogic(overdue, [], (id) => sent.push(id));
    expect(sent).toEqual(["a", "b"]);
  });

  it("sends nothing when overdue list is empty", async () => {
    const sent: string[] = [];
    await runEscalationLogic([], [], (id) => sent.push(id));
    expect(sent).toHaveLength(0);
  });
});

describe("Reminder Escalation — cutoff date calculation", () => {
  function cutoffIso(thresholdDays: number, today = "2026-06-01"): string {
    const d = new Date(today);
    d.setDate(d.getDate() - thresholdDays);
    return d.toISOString().slice(0, 10);
  }

  it("computes cutoff 3 days before today", () => {
    expect(cutoffIso(3, "2026-06-10")).toBe("2026-06-07");
  });

  it("computes cutoff 7 days before today", () => {
    expect(cutoffIso(7, "2026-06-10")).toBe("2026-06-03");
  });

  it("reminder past cutoff is overdue", () => {
    const cutoff = cutoffIso(3, "2026-06-10"); // 2026-06-07
    expect("2026-06-06" <= cutoff).toBe(true);
    expect("2026-06-08" <= cutoff).toBe(false);
  });
});
