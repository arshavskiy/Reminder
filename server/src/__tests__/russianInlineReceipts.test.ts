import { describe, expect, it } from "vitest";
import { classifyNoAttachmentEmail, buildInlineReceiptQueries } from "../gmail/inlineReceiptDetect";
import { parseInlineReceipt } from "../gmail/inlineReceiptParser";
import { isRussianReceiptSender, parseRussianAmount, parseRussianDate, parseRussianReceiptText } from "../gmail/russianReceipt";
import { buildGmailQuery } from "../routes/gmail";

describe("parseRussianAmount", () => {
  it.each([
    ["1 250,00", 1250],
    ["1 250,50", 1250.5],
    ["34 820", 34820],
    ["1.250,50", 1250.5],
    ["1,250.50", 1250.5],
    ["99,9", 99.9],
    ["12.50", 12.5],
    ["1.250", 1250],
    ["208,33", 208.33],
  ])("%s -> %s", (raw, expected) => {
    expect(parseRussianAmount(raw)).toBe(expected);
  });

  it("rejects empty, zero and non-numeric input", () => {
    expect(parseRussianAmount("")).toBeNull();
    expect(parseRussianAmount("0")).toBeNull();
    expect(parseRussianAmount("abc")).toBeNull();
  });
});

describe("parseRussianDate", () => {
  it("reads dd.mm.yyyy and worded dates", () => {
    expect(parseRussianDate("Дата: 03.10.2026 14:22")).toBe("2026-10-03");
    expect(parseRussianDate("3 октября 2026 г.")).toBe("2026-10-03");
    expect(parseRussianDate("15 Марта 2026")).toBe("2026-03-15");
  });

  it("rejects impossible dates and text without one", () => {
    expect(parseRussianDate("31.13.2026")).toBeNull();
    expect(parseRussianDate("без даты")).toBeNull();
  });
});

describe("isRussianReceiptSender", () => {
  it("accepts known Russian receipt senders and their subdomains", () => {
    for (const email of ["no-reply@ofd.ru", "check@mail.ozon.ru", "noreply@aeroflot.ru", "info@wildberries.ru", "x@tbank.ru", "robot@receipts.yandex.ru"]) {
      expect(isRussianReceiptSender(email), email).toBe(true);
    }
  });

  it("rejects other senders", () => {
    for (const email of ["news@example.com", "x@gmail.com", "x@ozon.ru.evil.com", "x@notozon.ru"]) {
      expect(isRussianReceiptSender(email), email).toBe(false);
    }
  });
});

describe("parseRussianReceiptText", () => {
  it("parses a cash receipt", () => {
    const text = "Кассовый чек № 125 Продавец: ООО «Ромашка» Дата: 03.10.2026 Итого: 1 250,00 ₽ в т.ч. НДС 20%: 208,33 ФД: 4411223";
    const parsed = parseRussianReceiptText(text, "check@ofd.ru", "Ваш чек");
    expect(parsed).toMatchObject({ vendor: "OFD", amount: 1250, currency: "RUB", date: "2026-10-03" });
    expect(parsed?.transactionId).toBeTruthy();
    expect(parsed?.merchant).toContain("Ромашка");
  });

  it("parses an order confirmation with the order number", () => {
    const text = "Спасибо за заказ! Номер заказа: 98765432 Сумма заказа: 3 499,00 руб. Оплачено картой 12 октября 2026";
    const parsed = parseRussianReceiptText(text, "noreply@ozon.ru", "Заказ оплачен");
    expect(parsed).toMatchObject({ vendor: "Ozon", amount: 3499, currency: "RUB", transactionId: "98765432", date: "2026-10-12" });
    expect(parsed?.dedupeKey).toBe("ru:noreply@ozon.ru:98765432");
  });

  it("parses an airline e-ticket receipt", () => {
    const text = "Маршрутная квитанция электронного билета. Электронный билет 2952400123456. Итого к оплате 34 820 RUB";
    const parsed = parseRussianReceiptText(text, "tickets@aeroflot.ru", "Ваш билет");
    expect(parsed).toMatchObject({ vendor: "Aeroflot", amount: 34820, currency: "RUB" });
  });

  it("keeps another currency when the mail states one", () => {
    const parsed = parseRussianReceiptText("Оплата прошла. Сумма: 45,00 USD. Заказ № ABC12345", "pay@yandex.ru", "Чек");
    expect(parsed).toMatchObject({ amount: 45, currency: "USD" });
  });

  it("gives a stable id when the mail carries no number, so a re-import dedupes", () => {
    const text = "Оплата прошла Сумма: 500 руб 01.10.2026";
    const a = parseRussianReceiptText(text, "robot@sber.ru", "Платеж");
    const b = parseRussianReceiptText(text, "robot@sber.ru", "Платеж");
    expect(a?.transactionId).toBe(b?.transactionId);
    expect(a?.transactionId).toContain("2026-10-01");
  });

  it("does not turn marketing mail into a receipt", () => {
    expect(parseRussianReceiptText("Скидки до 50%! Успейте купить со скидкой 1 000 руб.", "news@ozon.ru", "Распродажа")).toBeNull();
    expect(parseRussianReceiptText("Ваш чек готов, но сумма не указана", "check@ofd.ru", "Чек")).toBeNull();
  });

  it("is not triggered by words that merely contain 'чек'", () => {
    expect(parseRussianReceiptText("Каждый человек получит подарок. Итого 100 руб.", "x@ozon.ru", "Акция")).toBeNull();
  });
});

describe("integration with the inline receipt pipeline", () => {
  const html = "<html><body><p>Кассовый чек № 77</p><table><tr><td>Итого:</td><td>2&nbsp;100,00 ₽</td></tr></table><p>Дата 04.10.2026</p></body></html>";

  it("parseInlineReceipt handles a Russian sender", () => {
    const parsed = parseInlineReceipt("Магазин <check@ofd.ru>", html, "Ваш чек");
    expect(parsed).toMatchObject({ amount: 2100, currency: "RUB", date: "2026-10-04" });
  });

  it("parseInlineReceipt still ignores unknown senders", () => {
    expect(parseInlineReceipt("x@example.com", html, "Ваш чек")).toBeNull();
  });

  it("classifies a parseable Russian receipt as an importable inline receipt", () => {
    expect(classifyNoAttachmentEmail({ from: "check@ofd.ru", subject: "Ваш чек", html, plain: null, documentLinkUrl: null })).toEqual({ kind: "inline", documentLinkUrl: null, importable: true });
  });

  it("flags a Russian sender's receipt subject for detection even when it cannot be parsed", () => {
    const result = classifyNoAttachmentEmail({ from: "orders@wildberries.ru", subject: "Ваш заказ оплачен", html: "<p>Спасибо</p>", plain: null, documentLinkUrl: null });
    expect(result).toMatchObject({ kind: "inline", importable: false });
  });

  it("searches Russian senders in the inline receipt scan plan", () => {
    const plans = buildInlineReceiptQueries("invoice OR чек", 12);
    expect(plans.some((plan) => plan.query.includes("ofd.ru") && plan.query.includes("чек"))).toBe(true);
  });
});

describe("Gmail invoice search query", () => {
  const query = buildGmailQuery(undefined, { id: "t", name: "חשבונית", document_kind: "invoice" } as never, "business");

  it("includes the Russian invoice, receipt and payment terms", () => {
    for (const term of ["чек", "кассовый чек", "квитанция", "счет-фактура", "счет на оплату", "УПД", "подтверждение оплаты", "оплата"]) {
      expect(query, term).toContain(`"${term}"`);
    }
  });

  it("still includes the Hebrew and English terms", () => {
    for (const term of ["חשבונית", "קבלה", "invoice", "receipt"]) expect(query, term).toContain(`"${term}"`);
  });
});
