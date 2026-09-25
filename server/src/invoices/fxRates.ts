// Daily representative exchange rates published by the Bank of Israel, used to
// normalize invoice amounts in foreign currencies to Shekels for totals/sorting.
const BOI_XML_URL = "https://www.boi.org.il/PublicApi/GetExchangeRates";
// The Bank of Israel does not publish RUB. The Central Bank of Russia publishes
// RUB per USD daily, so RUB is crossed through the BoI USD rate.
const CBR_XML_URL = "https://www.cbr.ru/scripts/XML_daily.asp";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // BoI publishes once per business day

let cache: { rates: Map<string, number>; fetchedAt: number } | null = null;
let inFlight: Promise<Map<string, number>> | null = null;

async function fetchBoiRates(): Promise<Map<string, number>> {
  const res = await fetch(BOI_XML_URL);
  if (!res.ok) throw new Error(`BoI exchange rate request failed: ${res.status}`);
  const data = (await res.json()) as {
    exchangeRates?: Array<{ key: string; currentExchangeRate: number; unit?: number }>;
  };
  const rates = new Map<string, number>();
  rates.set("ILS", 1);
  for (const entry of data.exchangeRates ?? []) {
    const code = String(entry?.key ?? "").trim().toUpperCase();
    const rate = Number(entry?.currentExchangeRate);
    const unit = Number(entry?.unit) || 1;
    if (!code || !Number.isFinite(rate) || rate <= 0) continue;
    rates.set(code, rate / unit);
  }
  if (!rates.has("RUB")) {
    const usdIls = rates.get("USD");
    const rubPerUsd = usdIls ? await fetchCbrRubPerUsd().catch(() => null) : null;
    if (usdIls && rubPerUsd) rates.set("RUB", usdIls / rubPerUsd);
  }
  return rates;
}

// Parses "<CharCode>USD</CharCode><Nominal>1</Nominal>...<Value>84,3414</Value>"
// from the CBR daily XML. Values use a decimal comma and are per Nominal units.
export function parseCbrRubPerUsd(xml: string): number | null {
  const match = xml.match(/<CharCode>USD<\/CharCode>\s*<Nominal>(\d+)<\/Nominal>[\s\S]*?<Value>([\d.,]+)<\/Value>/);
  if (!match) return null;
  const nominal = Number(match[1]) || 1;
  const value = Number(match[2].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value / nominal : null;
}

async function fetchCbrRubPerUsd(): Promise<number | null> {
  const res = await fetch(CBR_XML_URL);
  if (!res.ok) throw new Error(`CBR exchange rate request failed: ${res.status}`);
  // The feed is windows-1251. The tags and numbers are ASCII, so latin1 is enough.
  const xml = new TextDecoder("latin1").decode(await res.arrayBuffer());
  return parseCbrRubPerUsd(xml);
}

async function getRates(): Promise<Map<string, number>> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.rates;
  if (inFlight) return inFlight;
  inFlight = fetchBoiRates()
    .then((rates) => {
      cache = { rates, fetchedAt: Date.now() };
      return rates;
    })
    .catch((err) => {
      if (cache) return cache.rates; // serve stale rates rather than fail the request
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

// Converts an amount in `currency` to ILS. Returns null if the amount is null
// or no rate is available (and the currency isn't already ILS).
export async function toIls(amount: number | null, currency: string): Promise<number | null> {
  if (amount === null || !Number.isFinite(amount)) return null;
  const code = currency.toUpperCase();
  if (code === "ILS") return amount;
  try {
    const rates = await getRates();
    const rate = rates.get(code);
    if (!rate) return null;
    return amount * rate;
  } catch {
    return null;
  }
}

// Batch helper: converts many (amount, currency) pairs with a single rate fetch.
export async function toIlsMany(
  entries: Array<{ amount: number | null; currency: string }>,
): Promise<Array<number | null>> {
  const rates = await getRates().catch(() => new Map<string, number>([["ILS", 1]]));
  return entries.map(({ amount, currency }) => {
    if (amount === null || !Number.isFinite(amount)) return null;
    const code = currency.toUpperCase();
    if (code === "ILS") return amount;
    const rate = rates.get(code);
    return rate ? amount * rate : null;
  });
}
