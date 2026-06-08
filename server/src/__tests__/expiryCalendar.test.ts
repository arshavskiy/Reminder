import {describe, expect, it} from "vitest";

// ── urgency computation (extracted from route logic) ─────────────────────────

function computeUrgency(daysUntil: number): "overdue" | "critical" | "warning" | "ok" {
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= 30) return "critical";
  if (daysUntil <= 90) return "warning";
  return "ok";
}

function daysUntil(expiryIso: string, todayIso: string): number {
  return Math.ceil(
    (new Date(expiryIso).getTime() - new Date(todayIso).getTime()) / 86400000
  );
}

describe("Certificate Expiry Calendar — urgency classification", () => {
  const TODAY = "2026-01-15";

  it("classifies past expiry as overdue", () => {
    expect(computeUrgency(daysUntil("2026-01-10", TODAY))).toBe("overdue");
    expect(computeUrgency(daysUntil("2025-12-01", TODAY))).toBe("overdue");
  });

  it("classifies expiry today as critical", () => {
    expect(computeUrgency(daysUntil("2026-01-15", TODAY))).toBe("critical");
  });

  it("classifies expiry within 30 days as critical", () => {
    expect(computeUrgency(daysUntil("2026-02-14", TODAY))).toBe("critical"); // exactly 30d
    expect(computeUrgency(daysUntil("2026-01-20", TODAY))).toBe("critical"); // 5d
  });

  it("classifies expiry 31–90 days as warning", () => {
    expect(computeUrgency(daysUntil("2026-02-15", TODAY))).toBe("warning"); // 31d
    expect(computeUrgency(daysUntil("2026-04-15", TODAY))).toBe("warning"); // 90d
  });

  it("classifies expiry beyond 90 days as ok", () => {
    expect(computeUrgency(daysUntil("2026-04-16", TODAY))).toBe("ok"); // 91d
    expect(computeUrgency(daysUntil("2027-01-01", TODAY))).toBe("ok");
  });
});

describe("Certificate Expiry Calendar — contract type filter", () => {
  const inspectionKeywords = ["תסקיר", "בדיקה", "inspection", "certificate"];

  function isInspectionType(contractType: string | null): boolean {
    if (!contractType) return true; // null passes through
    return inspectionKeywords.some((kw) =>
      contractType.toLowerCase().includes(kw.toLowerCase())
    );
  }

  it("includes תסקיר contracts", () => {
    expect(isInspectionType("תסקיר בדיקה")).toBe(true);
  });

  it("includes בדיקה contracts", () => {
    expect(isInspectionType("דוח בדיקה שנתי")).toBe(true);
  });

  it("includes null contract_type (no type set)", () => {
    expect(isInspectionType(null)).toBe(true);
  });

  it("includes english inspection/certificate", () => {
    expect(isInspectionType("Annual Inspection")).toBe(true);
    expect(isInspectionType("Safety Certificate")).toBe(true);
  });

  it("excludes unrelated contract types", () => {
    expect(isInspectionType("חוזה שכירות")).toBe(false);
    expect(isInspectionType("ביטוח רכב")).toBe(false);
  });
});

describe("Certificate Expiry Calendar — days_until calculation", () => {
  it("returns negative for past dates", () => {
    expect(daysUntil("2026-01-01", "2026-01-15")).toBeLessThan(0);
  });

  it("returns 0 or positive for today/future", () => {
    expect(daysUntil("2026-01-15", "2026-01-15")).toBeGreaterThanOrEqual(0);
    expect(daysUntil("2026-12-31", "2026-01-15")).toBeGreaterThan(0);
  });
});
