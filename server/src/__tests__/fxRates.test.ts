import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCbrRubPerUsd, toIls, toIlsMany } from "../invoices/fxRates";

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

  it("returns null for RUB when the Russian central bank feed is unavailable", async () => {
    vi.resetModules();
    const fresh = await import("../invoices/fxRates");
    expect(await fresh.toIls(1000, "RUB")).toBeNull();
  });
});

const CBR_XML = '<?xml version="1.0" encoding="windows-1251"?><ValCurs Date="26.09.2026">'
  + '<Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>US</Name><Value>90,0000</Value><VunitRate>90,0000</VunitRate></Valute>'
  + '<Valute ID="R01239"><NumCode>978</NumCode><CharCode>EUR</CharCode><Nominal>1</Nominal><Name>EU</Name><Value>100,5000</Value></Valute>'
  + '</ValCurs>';

describe("RUB via the Russian central bank", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads RUB per USD from the CBR daily XML", () => {
    expect(parseCbrRubPerUsd(CBR_XML)).toBeCloseTo(90);
    expect(parseCbrRubPerUsd("<ValCurs></ValCurs>")).toBeNull();
  });

  it("converts RUB to ILS through the BoI USD rate", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("cbr.ru")
      ? { ok: true, arrayBuffer: async () => new TextEncoder().encode(CBR_XML).buffer }
      : { ok: true, json: async () => BOI_RESPONSE })));
    vi.resetModules();
    const fresh = await import("../invoices/fxRates");
    // 1 USD = 3.6 ILS and 90 RUB, so 900 RUB = 10 USD = 36 ILS.
    expect(await fresh.toIls(900, "RUB")).toBeCloseTo(36);
  });

  it("crosses other currencies the BoI lacks through RUB", async () => {
    const xml = CBR_XML.replace("</ValCurs>", '<Valute ID="R01675"><NumCode>764</NumCode><CharCode>THB</CharCode><Nominal>10</Nominal><Name>TH</Name><Value>27,0000</Value></Valute></ValCurs>');
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("cbr.ru")
      ? { ok: true, arrayBuffer: async () => new TextEncoder().encode(xml).buffer }
      : { ok: true, json: async () => BOI_RESPONSE })));
    vi.resetModules();
    const fresh = await import("../invoices/fxRates");
    // 10 THB = 27 RUB = 0.3 USD = 1.08 ILS, so 100 THB = 10.8 ILS.
    expect(await fresh.toIls(100, "THB")).toBeCloseTo(10.8);
    // BoI rates still win for currencies it publishes.
    expect(await fresh.toIls(100, "EUR")).toBeCloseTo(400);
  });
});
