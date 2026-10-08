import { describe, expect, it } from "vitest";
import { isAmountSpike } from "../reminders/scheduler.js";

describe("isAmountSpike", () => {
  it("returns false when amount equals avg (no spike)", () => {
    expect(isAmountSpike(100, 100)).toBe(false);
  });

  it("returns true when amount equals exactly 115 and avg is 100 (float: 100*1.15=114.999...)", () => {
    expect(isAmountSpike(115, 100)).toBe(true);
  });

  it("returns true when amount is above 115% of avg", () => {
    expect(isAmountSpike(116, 100)).toBe(true);
  });

  it("returns false for a small increase within 15%", () => {
    expect(isAmountSpike(110, 100)).toBe(false);
  });

  it("returns true for a large spike (double the avg)", () => {
    expect(isAmountSpike(200, 100)).toBe(true);
  });

  it("returns false when avg is 0 (guard against division by zero)", () => {
    expect(isAmountSpike(500, 0)).toBe(false);
  });

  it("returns false when avg is negative", () => {
    expect(isAmountSpike(100, -50)).toBe(false);
  });

  it("handles fractional amounts correctly", () => {
    // avg=50, 15% threshold = 57.5; 58 > 57.5 → spike
    expect(isAmountSpike(58, 50)).toBe(true);
    // 57 < 57.5 → no spike
    expect(isAmountSpike(57, 50)).toBe(false);
  });
});
