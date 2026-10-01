import { describe, expect, it } from "vitest";
import { resolveDateRangePreset } from "../../../client/src/shared/dateRangePresets";
import {
  asString,
  asStringArray,
  clearTableState,
  decodeDateRange,
  encodeDateRange,
  loadTableState,
  pickOne,
  saveTableState,
  tableStateKey,
  type StorageLike,
} from "../../../client/src/shared/tableState";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = value; },
    removeItem: (key) => { delete data[key]; },
  };
}

describe("table state storage", () => {
  it("keys the saved view per user and page", () => {
    expect(tableStateKey(7, "invoices")).not.toBe(tableStateKey(8, "invoices"));
    expect(tableStateKey(7, "invoices")).not.toBe(tableStateKey(7, "documents"));
    expect(tableStateKey(undefined, "invoices")).toContain("anon");
  });

  it("round-trips what was saved", () => {
    const storage = memoryStorage();
    const key = tableStateKey(1, "documents");
    saveTableState(storage, key, { status: "error", pageSize: 50, clientId: null });
    expect(loadTableState(storage, key)).toEqual({ status: "error", pageSize: 50, clientId: null });
  });

  it("ignores missing, corrupt, wrong-version and non-object data", () => {
    const key = tableStateKey(1, "x");
    expect(loadTableState(memoryStorage(), key)).toBeNull();
    expect(loadTableState(memoryStorage({ [key]: "{not json" }), key)).toBeNull();
    expect(loadTableState(memoryStorage({ [key]: JSON.stringify({ v: 99, data: { a: 1 } }) }), key)).toBeNull();
    expect(loadTableState(memoryStorage({ [key]: JSON.stringify({ v: 1, data: [1] }) }), key)).toBeNull();
    expect(loadTableState(null, key)).toBeNull();
  });

  it("survives a storage that throws", () => {
    const broken: StorageLike = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("denied"); },
    };
    expect(() => saveTableState(broken, "k", { a: 1 })).not.toThrow();
    expect(() => clearTableState(broken, "k")).not.toThrow();
    expect(loadTableState(broken, "k")).toBeNull();
  });

  it("clears a saved view", () => {
    const storage = memoryStorage();
    saveTableState(storage, "k", { a: 1 });
    clearTableState(storage, "k");
    expect(loadTableState(storage, "k")).toBeNull();
  });
});

describe("date range persistence", () => {
  const now = new Date(2026, 9, 1, 12, 0, 0);

  it("saves a preset by id so it stays a trailing window", () => {
    expect(encodeDateRange(resolveDateRangePreset("3m", now), now)).toEqual({ preset: "3m" });
    const later = new Date(2026, 10, 15, 9, 0, 0);
    expect(decodeDateRange({ preset: "3m" }, later)).toEqual(resolveDateRangePreset("3m", later));
  });

  it("saves a custom range as dates", () => {
    const custom: [number, number] = [Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 31)];
    const saved = encodeDateRange(custom, now);
    expect(saved).toEqual({ from: custom[0], to: custom[1] });
    expect(decodeDateRange(saved, now)).toEqual(custom);
  });

  it("tells all-time apart from never chosen", () => {
    expect(encodeDateRange(null, now)).toEqual({ none: true });
    expect(decodeDateRange({ none: true }, now)).toBeNull();
    expect(decodeDateRange(undefined, now)).toBeUndefined();
    expect(decodeDateRange("garbage", now)).toBeUndefined();
  });

  it("rejects unknown presets and reversed ranges", () => {
    expect(decodeDateRange({ preset: "10y" }, now)).toBeUndefined();
    expect(decodeDateRange({ from: 5, to: 1 }, now)).toBeUndefined();
    expect(decodeDateRange({ from: "a", to: 1 }, now)).toBeUndefined();
  });
});

describe("saved value validation", () => {
  it("pickOne keeps only allowed options", () => {
    expect(pickOne("error", ["all", "error"], "all")).toBe("error");
    expect(pickOne("gone", ["all", "error"], "all")).toBe("all");
    expect(pickOne(50, [10, 20, 50], 20)).toBe(50);
    expect(pickOne(7, [10, 20, 50], 20)).toBe(20);
  });

  it("asString / asStringArray drop wrong types", () => {
    expect(asString("x")).toBe("x");
    expect(asString(3)).toBeNull();
    expect(asString(undefined, "none")).toBe("none");
    expect(asStringArray(["a", 1, "b", null])).toEqual(["a", "b"]);
    expect(asStringArray("a")).toEqual([]);
  });
});
