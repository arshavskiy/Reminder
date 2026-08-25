import {describe, expect, it} from "vitest";
import {applyDuplicateClientFields, uniqueClientIds} from "../clients/mergeClients";

describe("uniqueClientIds", () => {
  it("dedupes and trims client ids", () => {
    expect(uniqueClientIds([" a ", "b", "a", "", "b "])).toEqual(["a", "b"]);
  });

  it("returns an empty list for non-arrays", () => {
    expect(uniqueClientIds(null)).toEqual([]);
    expect(uniqueClientIds("x")).toEqual([]);
  });
});

describe("applyDuplicateClientFields", () => {
  it("keeps the first filled email when merging three clients", () => {
    const canonical = {display_name: "C", email: null, notes: null};
    applyDuplicateClientFields(canonical, {display_name: "A", email: "a@x.com", notes: "from a"});
    applyDuplicateClientFields(canonical, {display_name: "B", email: "b@x.com", notes: "from b"});
    expect(canonical.email).toBe("a@x.com");
    expect(String(canonical.notes)).toContain("from a");
    expect(String(canonical.notes)).toContain("from b");
    expect(String(canonical.notes)).toContain("מוזג לקוח כפול \"B\"");
  });
});
