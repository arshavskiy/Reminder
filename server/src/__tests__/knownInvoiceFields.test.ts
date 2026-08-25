import {describe, expect, it} from "vitest";
import {extractKnownInvoiceFields} from "../pipeline/importer";

describe("extractKnownInvoiceFields", () => {
  it("accepts Israel Electric Company receipts as valid invoice records", () => {
    const text = `
חברת החשמל לישראל בע"מ
קבלה
מספר קבלה - מקור 300027124283
לכבוד:
ארשבסקי פבל
מספר חברה 520000472
מורשה באיחוד עוסקים מס' 558418570
חברת החשמל לישראל בע"מ
מספר חשבון חוזה 347149361
שולם על ידי: פבל ארשבסקי
פרטים מספר חשבונית 2023400799566 חשבון חוזה 347149361
סה"כ 577.63
סה"כ לתשלום (ש"ח) 577.63
שיטת תשלום כרטיס אשראי תאריך תשלום 09.07.2023 מספר כרטיס אשראי 7243
סכום 577.63
`;

    const fields = extractKnownInvoiceFields(text, "iec-receipt.pdf");

    expect(fields).toMatchObject({
      supplier_name: "חברת החשמל לישראל בע\"מ",
      invoice_number: "300027124283",
      receipt_number: "300027124283",
      document_subtype: "קבלה",
      client_company: "ארשבסקי פבל",
      customer_number: "347149361",
      account_number: "347149361",
      issue_date: "2023-07-09",
      payment_due_date: "2023-07-09",
      amount: 577.63,
      amount_before_vat: 577.63,
      vat_amount: 0,
      currency: "ILS",
      payment_status: "paid",
      payment_method: "כרטיס אשראי - 7243",
    });
  });

  it("extracts newer Israel Electric receipts with payment date and amount", () => {
    const text = `
חברת החשמל לישראל בע"מ
קבלה
מספר קבלה - מקור 30040315515
לכבוד:
ארשבסקי פבל
מספר חשבון חוזה 347149361
Pavel Arshavsky שולם על ידי:
פרטים מספר חשבונית 2024471074350 חשבון חוזה 347149361
סה"כ 709.74
שיטת תשלום כרטיס אשראי תאריך תשלום 18.08.2024 מספר כרטיס אשראי 7243 סטטוס תשלום רגיל
סה"כ לתשלום (ש"ח) 709.74
`;

    const fields = extractKnownInvoiceFields(text, "2024-440087274_20240115_175244.pdf");

    expect(fields).toMatchObject({
      supplier_name: "חברת החשמל לישראל בע\"מ",
      invoice_number: "30040315515",
      document_subtype: "קבלה",
      client_company: "ארשבסקי פבל",
      issue_date: "2024-08-18",
      payment_due_date: "2024-08-18",
      amount: 709.74,
      payment_status: "paid",
    });
  });

  it("extracts Israel Electric receipts paid in July 2024", () => {
    const text = `
חברת החשמל לישראל בע"מ
קבלה
מספר קבלה - מקור 300039260148
לכבוד:
ארשבסקי פבל
מספר חשבון חוזה 347149361
Pavel Arshavsky שולם על ידי:
פרטים מספר חשבונית 2024490802380 חשבון חוזה 347149361
סה"כ 676.80
שיטת תשלום כרטיס אשראי תאריך תשלום 28.07.2024 מספר כרטיס אשראי 7243 סטטוס תשלום רגיל
סה"כ לתשלום (ש"ח) 676.80
`;

    const fields = extractKnownInvoiceFields(text, "iec-july-2024.pdf");

    expect(fields).toMatchObject({
      supplier_name: "חברת החשמל לישראל בע\"מ",
      invoice_number: "300039260148",
      receipt_number: "300039260148",
      document_subtype: "קבלה",
      client_company: "ארשבסקי פבל",
      customer_number: "347149361",
      issue_date: "2024-07-28",
      payment_due_date: "2024-07-28",
      amount: 676.8,
      payment_method: "כרטיס אשראי - 7243",
      payment_status: "paid",
    });
  });

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

  it("accepts GitHub receipts without a due date", () => {
    const text = `
GitHub
Receipt
Date
Aug 4, 2026
Transaction ID
gh-2026-08-04-100
Account billed
Pavel-Arshavsky
Charged to
Visa ending in 4242
Total
$4.00 USD
`;

    const fields = extractKnownInvoiceFields(text, "github-arshavskiy-receipt-2026-08-04.pdf");

    expect(fields).toMatchObject({
      supplier_name: "GitHub, Inc.",
      invoice_number: "gh-2026-08-04-100",
      document_subtype: "קבלה",
      client_company: "Pavel-Arshavsky",
      issue_date: "2026-08-04",
      payment_due_date: "2026-08-04",
      amount: 4,
      currency: "USD",
      payment_status: "paid",
    });
  });

  it("extracts GitHub Copilot receipt table totals", () => {
    const text = `
GitHub
Receipt
Date
2026-08-04 01:18PM PDT
Account billed
arshavskiy (arshavsky.pasha@gmail.com)
Transaction ID
ch_3U0onWJFr6CCHwIi1IFJtOwE
Charged to
MasterCard (5*** **** **** 8021)
Description
Amount
GitHub Copilot Pro - month
$7.10 USD
Aug 4, 2026 - Aug 25, 2026
Total
$7.10 USD*
GitHub, Inc.
`;

    const fields = extractKnownInvoiceFields(text, "github-arshavskiy-receipt-2026-08-04.pdf");

    expect(fields).toMatchObject({
      supplier_name: "GitHub, Inc.",
      invoice_number: "ch_3U0onWJFr6CCHwIi1IFJtOwE",
      document_subtype: "קבלה",
      client_company: "arshavskiy (arshavsky.pasha@gmail.com)",
      issue_date: "2026-08-04",
      payment_due_date: "2026-08-04",
      amount: 7.1,
      currency: "USD",
      payment_status: "paid",
    });
    expect(fields?.items).toEqual([
      { description: "GitHub Copilot Pro - month", amount: 7.1, currency: "USD" },
    ]);
  });

  it("accepts Railway usage receipts", () => {
    const text = `
Receipt
Invoice number 796FCAA1-0002
Receipt number 2656-9301
Date paid June 22, 2026

Railway Corporation
548 Market St
San Francisco, California 94104
billing@railway.com

Bill to
Pavel
arshavsky.pasha@gmail.com

$8.06 paid on June 22, 2026

Description Qty Unit price Amount
Agent Usage 5,266,012 $0.000001 $5.27
May 21-Jun 21, 2026
Memory 11,532,406 $0.00000023148148 $2.67
Hobby plan 1 $5.00 $5.00
Subtotal $13.06
Hobby plan monthly included usage ($5.00 off) -$5.00
Total $8.06
Amount paid $8.06

Payment method Date Amount paid Receipt number
Mastercard - 8021 June 22, 2026 $8.06 2656-9301
`;

    const fields = extractKnownInvoiceFields(text, "Receipt-2656-9301.pdf");

    expect(fields).toMatchObject({
      supplier_name: "Railway Corporation",
      // A receipt keys on its own number, not the invoice number it reprints —
      // otherwise the receipt and its invoice collapse into one record.
      invoice_number: "2656-9301",
      receipt_number: "2656-9301",
      document_subtype: "קבלה",
      client_company: "Pavel",
      issue_date: "2026-06-22",
      payment_due_date: "2026-06-22",
      amount: 8.06,
      amount_before_vat: 13.06,
      currency: "USD",
      payment_status: "paid",
      payment_method: "Mastercard - 8021",
    });
  });

  it("keeps a Railway invoice distinct from the receipt that settles it", () => {
    const text = `
Invoice
Invoice number 796FCAA1-0002
Date of issue June 22, 2026
Date due June 22, 2026

Railway Corporation
billing@railway.com

Bill to
Pavel
arshavsky.pasha@gmail.com

Total $8.06
Amount paid $8.06

Payment method Date Amount paid Receipt number
Mastercard - 8021 June 22, 2026 $8.06 2656-9301
`;

    const fields = extractKnownInvoiceFields(text, "Invoice-796FCAA1-0002.pdf");

    expect(fields).toMatchObject({
      supplier_name: "Railway Corporation",
      invoice_number: "796FCAA1-0002",
      document_subtype: "חשבונית",
    });
  });

  it("extracts Gett ride receipts from reversed RTL text", () => {
    // Gett PDFs are Hebrew RTL and the parser emits each line reversed; this is
    // the raw_text shape the extractor actually sees.
    const text = `
מ"בע סיסטמס גטאקסי יטי'ג
514593573 מ"מע תיק / 514593573 ח.פ.
אביב תל החייל רמת, ד כניסה 19 הברזל
ממוחשב מסמך
Pavel :לכבוד
arshavsky.pasha@gmail.com :ל"דוא
מקור 132306144: מספר - קבלה
83219292': מס נסיעה
122.60כ"סה
122.60Mastercard *8021 באמצעות שולם
22/01/2026: תאריך
`;

    const fields = extractKnownInvoiceFields(text, "receipt_20260121_132306144.pdf");

    expect(fields).toMatchObject({
      supplier_name: "ג'יטי גטאקסי סיסטמס בע\"מ",
      supplier_id: "514593573",
      invoice_number: "132306144",
      receipt_number: "132306144",
      document_subtype: "קבלה",
      issue_date: "2026-01-22",
      amount: 122.6,
      currency: "ILS",
      payment_status: "paid",
      payment_method: "Mastercard - 8021",
    });
  });
});
