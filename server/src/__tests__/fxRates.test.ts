import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toIls, toIlsMany } from "../invoices/fxRates";

const BOI_RESPONSE = {
  exchangeRates: [
    { key: "USD", currentExchangeRate: 3.6, unit: 1, currentChange: 0, lastUpdate: "2026-01-01T00:00:00Z" },
    { key: "EUR", currentExchangeRate: 4.0, unit: 1, currentChange: 0, lastUpdate: "2026-01-01T00:00:00Z" },
    { key: "JPY", currentExchangeRate: 2.4, unit: 100, currentChange: 0, lastUpdate: "2026-01-01T00:00:00Z" },
  ],
};

describe("fxRates", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => BOI_RESPONSE,
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the amount unchanged for ILS", async () => {
    expect(await toIls(100, "ILS")).toBe(100);
  });

  it("converts a foreign amount using the fetched rate", async () => {
    expect(await toIls(100, "USD")).toBeCloseTo(360);
    expect(await toIls(100, "EUR")).toBeCloseTo(400);
  });

  it("applies the unit divisor for currencies quoted per 100", async () => {
    expect(await toIls(1000, "JPY")).toBeCloseTo(24);
  });

  it("returns null for an unknown currency", async () => {
    expect(await toIls(100, "XXX")).toBeNull();
  });

  it("returns null for a null amount", async () => {
    expect(await toIls(null, "USD")).toBeNull();
  });

  it("converts a batch of mixed currencies", async () => {
    const result = await toIlsMany([
      { amount: 100, currency: "ILS" },
      { amount: 100, currency: "USD" },
      { amount: 50, currency: "EUR" },
      { amount: null, currency: "USD" },
    ]);
    expect(result[0]).toBe(100);
    expect(result[1]).toBeCloseTo(360);
    expect(result[2]).toBeCloseTo(200);
    expect(result[3]).toBeNull();
  });
});
