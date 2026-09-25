import { describe, expect, it } from "vitest";
import { classifyDocumentKind } from "../templates/seedTemplates";

describe("Russian receipts", () => {
  it("classifies a Russian cash receipt as an invoice", () => {
    const text = "Кассовый чек № 125\nПриход\nИтого: 1 250,00 ₽\nв т.ч. НДС 20%: 208,33";
    expect(classifyDocumentKind(text)).toBe("invoice");
  });

  it("classifies an airline itinerary receipt as an invoice", () => {
    const text = "Red Wings\nМаршрутная квитанция электронного билета\nЭлектронный билет 2952400123456\nИтого к оплате 34 820 RUB";
    expect(classifyDocumentKind(text)).toBe("invoice");
  });
});
