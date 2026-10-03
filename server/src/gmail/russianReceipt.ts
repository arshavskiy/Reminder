import type { ParsedInlineReceipt } from "./inlineReceiptParser";

/**
 * Receipts and order confirmations that Russian senders put in the email body (no PDF):
 * cash receipts forwarded by OFD operators, marketplace and taxi receipts, airline and
 * rail confirmations, telecom and bank payment notices. Only a whitelist of sender
 * domains is parsed into an invoice record, same as the other inline receipts.
 */

const RU_SENDER_LABELS: Array<{ pattern: RegExp; vendor: string }> = [
  { pattern: /@([a-z0-9-]+\.)*(ofd|ofd-ya|platformaofd|taxcom|1-ofd|ofd1|kontur-ofd|sbis|cloudkassir|atol)\.(ru|com)$/i, vendor: "OFD" },
  { pattern: /@([a-z0-9-]+\.)*ozon\.(ru|com)$/i, vendor: "Ozon" },
  { pattern: /@([a-z0-9-]+\.)*(wildberries|wb)\.ru$/i, vendor: "Wildberries" },
  { pattern: /@([a-z0-9-]+\.)*yandex\.(ru|com|net)$/i, vendor: "Yandex" },
  { pattern: /@([a-z0-9-]+\.)*aeroflot\.(ru|com)$/i, vendor: "Aeroflot" },
  { pattern: /@([a-z0-9-]+\.)*s7\.ru$/i, vendor: "S7 Airlines" },
  { pattern: /@([a-z0-9-]+\.)*(pobeda|flypobeda)\.(aero|ru)$/i, vendor: "Pobeda" },
  { pattern: /@([a-z0-9-]+\.)*rzd\.ru$/i, vendor: "RZD" },
  { pattern: /@([a-z0-9-]+\.)*(tbank|tinkoff)\.ru$/i, vendor: "T-Bank" },
  { pattern: /@([a-z0-9-]+\.)*(sberbank|sber)\.ru$/i, vendor: "Sber" },
  { pattern: /@([a-z0-9-]+\.)*(vtb|alfabank)\.ru$/i, vendor: "Bank" },
  { pattern: /@([a-z0-9-]+\.)*(mts|beeline|megafon|tele2|rostelecom)\.ru$/i, vendor: "Telecom" },
  { pattern: /@([a-z0-9-]+\.)*(gosuslugi|mos)\.ru$/i, vendor: "Gosuslugi" },
  { pattern: /@([a-z0-9-]+\.)*(avito|dns-shop|citilink|mvideo|eldorado|lamoda|sbermarket|samokat|vkusvill|magnit|5ka|perekrestok|lenta)\.(ru|com)$/i, vendor: "Retail" },
];

export function isRussianReceiptSender(email: string): boolean {
  return RU_SENDER_LABELS.some(({ pattern }) => pattern.test(email));
}

const RU_MONTHS: Record<string, string> = {
  января: "01", февраля: "02", марта: "03", апреля: "04", мая: "05", июня: "06",
  июля: "07", августа: "08", сентября: "09", октября: "10", ноября: "11", декабря: "12",
};

// A document that proves payment, not a marketing mail from the same sender.
const RECEIPT_MARKER_RE = /кассовый чек|(?<![а-я])чек(?![а-я])|квитанци|оплата прошла|оплачен|подтверждение оплаты|платеж(?:ное)? поручение|спасибо за (?:покупку|заказ|оплату)|ваш заказ|электронный билет|маршрутная квитанция/i;
// "Итого", "К оплате", "Сумма" followed by an amount like "1 250,00" with a currency marker.
const AMOUNT_RE = /(?:итого к оплате|итого|всего к оплате|к оплате|сумма чека|сумма заказа|сумма платежа|сумма к оплате|сумма|оплачено|списано)\s*[:=-]?\s*(\d[\d\s .,]*\d|\d)\s*(₽|руб(?:\.|лей|ля)?|rub|р\.|usd|eur|\$|€)/i;
const TXN_RE = /(?:номер\s*)?(?:чека|заказа|операции|транзакции|платежа|билета|брони|заказ|чек|операция|транзакция|билет)\s*(?:№|#|n)?\s*[:№#]?\s*([A-Za-z0-9][A-Za-z0-9-]{4,})/i;
const FISCAL_RE = /(?:фд|фискальный документ)\s*[:№]?\s*(\d{3,})/i;

/** "1 250,00" -> 1250, "1.250,50" -> 1250.5, "34 820" -> 34820. */
export function parseRussianAmount(raw: string): number | null {
  const compact = raw.replace(/[\s ]/g, "");
  if (!compact) return null;
  let normalised = compact;
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // The later separator is the decimal one; the other groups thousands.
    const decimal = lastComma > lastDot ? "," : ".";
    const group = decimal === "," ? "." : ",";
    normalised = compact.split(group).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    normalised = /,\d{1,2}$/.test(compact) ? compact.replace(",", ".") : compact.replace(/,/g, "");
  } else if (lastDot >= 0 && !/\.\d{1,2}$/.test(compact)) {
    normalised = compact.replace(/\./g, "");
  }
  const value = Number(normalised);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parseRussianDate(text: string): string | null {
  const numeric = text.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  if (numeric) {
    const [, day, month, year] = numeric;
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) return `${year}-${month}-${day}`;
  }
  const worded = text.toLowerCase().match(/\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/);
  if (worded) return `${worded[3]}-${RU_MONTHS[worded[2]]}-${worded[1].padStart(2, "0")}`;
  return null;
}

function currencyOf(token: string): string {
  const t = token.toLowerCase();
  if (t === "usd" || t === "$") return "USD";
  if (t === "eur" || t === "€") return "EUR";
  return "RUB";
}

function vendorFor(email: string): string {
  return RU_SENDER_LABELS.find(({ pattern }) => pattern.test(email))?.vendor ?? "Russian sender";
}

function merchantOf(text: string): string | null {
  const match = text.match(/(?:продавец|организация|магазин|получатель|исполнитель)\s*[:-]?\s*((?:ООО|ИП|АО|ПАО|ЗАО)?\s*[«"“]?[^|\n.,;:]{3,60}[»"”]?)/i);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

/**
 * Parses plain text (HTML already stripped) of a Russian receipt email. Returns null
 * unless it has both a payment marker and an amount with a currency, so promotional
 * mail from the same senders is never turned into an invoice.
 */
export function parseRussianReceiptText(text: string, email: string, subject: string): ParsedInlineReceipt | null {
  const haystack = `${subject} ${text}`.replace(/ё/gi, (c) => (c === "ё" ? "е" : "Е"));
  if (!RECEIPT_MARKER_RE.test(haystack)) return null;
  const amountMatch = haystack.match(AMOUNT_RE);
  if (!amountMatch) return null;
  const amount = parseRussianAmount(amountMatch[1]);
  if (amount === null) return null;

  const date = parseRussianDate(haystack);
  const txn = haystack.match(TXN_RE)?.[1] ?? haystack.match(FISCAL_RE)?.[1] ?? null;
  // A stable id even when the mail carries none, so re-importing the same mail dedupes.
  const transactionId = txn ?? `ru-${email}-${date ?? "undated"}-${amount}`;
  return {
    vendor: vendorFor(email),
    transactionId,
    amount,
    currency: currencyOf(amountMatch[2]),
    merchant: merchantOf(text),
    date,
    dedupeKey: txn ? `ru:${email}:${txn}` : null,
  };
}
