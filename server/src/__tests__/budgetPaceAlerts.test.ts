import { describe, expect, it } from "vitest";
import { projectMonthEndSpend } from "../reminders/scheduler.js";

describe("projectMonthEndSpend", () => {
  it("projects linear spend to month-end", () => {
    // Day 15 of 30: spent 500 → projected 1000
    expect(projectMonthEndSpend(500, 15, 30)).toBe(1000);
  });

  it("rounds to nearest integer", () => {
    // 100 / 15 * 31 = 206.67 → 207
    expect(projectMonthEndSpend(100, 15, 31)).toBe(207);
  });

  it("returns 0 when nothing spent", () => {
    expect(projectMonthEndSpend(0, 15, 30)).toBe(0);
  });

  it("returns 0 when daysElapsed is 0 (guard against division by zero)", () => {
    expect(projectMonthEndSpend(500, 0, 30)).toBe(0);
  });

  it("returns actual spend when day equals daysInMonth", () => {
    expect(projectMonthEndSpend(300, 30, 30)).toBe(300);
  });

  it("handles small spend below threshold not triggering", () => {
    // Day 15: spent 10 → projected 20 — caller compares against threshold
    const projected = projectMonthEndSpend(10, 15, 30);
    expect(projected).toBe(20);
    expect(projected < 1000).toBe(true); // below a 1000 threshold
  });

  it("handles mid-month high spend correctly", () => {
    // Day 14 of 28: spent 900 → projected 1800
    expect(projectMonthEndSpend(900, 14, 28)).toBe(1800);
  });
});
