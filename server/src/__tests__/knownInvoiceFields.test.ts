import {describe, expect, it} from "vitest";
import {extractKnownInvoiceFields} from "../pipeline/importer";

describe("extractKnownInvoiceFields", () => {
  it("extracts HOT periodic bills with a synthetic invoice number", () => {
    const text = `
HOT
פירוט חשבון
פירוט חודשי למנוי: פבל ארשבסקי - 370039
חודש החשבון: 01.2024
תקופת חיוב השימושים: 09/12/2023-08/01/2024

שירותים קבועים
שירותי אינטרנט 3711
סה"כ שירותים קבועים 69.15 80.90
סה"כ חיובים וזיכויים לתקופת החשבון הנוכחית
69.15 80.90

לתשומת לבכם, בתאריך 16/02/2024 יסתיים הזיכוי החודשי
`;

    const fields = extractKnownInvoiceFields(text, "154367501.pdf");

    expect(fields).toMatchObject({
      supplier_name: "HOT",
      invoice_number: "HOT-370039-2023-12-09-2024-01-08",
      document_subtype: "חשבון תקופתי",
      client_company: "פבל ארשבסקי",
      customer_number: "370039",
      issue_date: "2024-01-08",
      payment_due_date: "2024-02-16",
      billing_period: "2023-12-09 - 2024-01-08",
      amount: 80.9,
      amount_before_vat: 69.15,
      currency: "ILS",
    });
  });
});
