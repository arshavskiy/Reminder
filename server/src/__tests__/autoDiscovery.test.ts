import { describe, expect, it } from "vitest";
import { autoScanDue, discoveryDigest, newDiscoveryIds } from "../gmail/autoDiscovery";

const NOW = new Date("2026-10-01T12:00:00Z");

describe("autoScanDue", () => {
  it("is due when never scanned", () => {
    expect(autoScanDue(null, NOW)).toBe(true);
    expect(autoScanDue(undefined, NOW)).toBe(true);
  });

  it("is not due inside the interval and due at the boundary", () => {
    expect(autoScanDue(new Date("2026-09-26T12:00:01Z"), NOW)).toBe(false);
    expect(autoScanDue(new Date("2026-09-24T12:00:00Z"), NOW)).toBe(true);
  });

  it("treats an unreadable date as due", () => {
    expect(autoScanDue("not-a-date", NOW)).toBe(true);
  });
});

describe("newDiscoveryIds", () => {
  it("returns only ids that were not saved before, without duplicates", () => {
    expect(newDiscoveryIds(["a", "b"], ["b", "c", "c", "d"])).toEqual(["c", "d"]);
  });

  it("returns nothing on a rerun with the same results", () => {
    expect(newDiscoveryIds(["a", "b"], ["a", "b"])).toEqual([]);
  });
});

describe("discoveryDigest", () => {
  it("leads with the earliest date", () => {
    const digest = discoveryDigest([
      { entity_name: "Later", due_date: "2026-12-01" },
      { entity_name: "Sooner", due_date: "2026-10-05" },
    ], "en");
    expect(digest.title).toBe("2 new deadlines found in your email");
    expect(digest.body).toBe("Sooner · 2026-10-05");
  });

  it("uses singular Hebrew text for one item", () => {
    expect(discoveryDigest([{ entity_name: "X", due_date: "2026-10-05" }]).title).toBe("נמצא מועד חדש בדואר שלך");
  });
});
