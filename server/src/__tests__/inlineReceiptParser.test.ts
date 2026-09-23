import { describe, expect, it } from "vitest";
import { parseInlineReceipt } from "../gmail/inlineReceiptParser";

const PAYPAL_HTML = `
<table><tr><td>Transaction ID</td><td>4CK43185JF938500R</td></tr>
<tr><td>Transaction date</td><td>30 May 2024</td></tr></table>
<table><tr><td>Merchant</td><td>Temu.com</td><td>no-reply@temu.com</td></tr></table>
<table><tr><td>Subtotal</td><td>₪219.14 ILS</td></tr>
<tr><td>Total</td><td>₪219.14 ILS</td></tr></table>
`;

// Captured from a real "Your Google Play Order Receipt" email.
const REAL_GOOGLE_PLAY_TEXT = `
Google Play
Thank you
Your subscription from Google Commerce Limited on Google Play continues and
you've been charged. Manage your subscriptions
To help keep your subscription active, add a backup payment method.
Add backup
Order number: SOP.3385-8665-0643-31794..26
Order date: 6 Nov 2025 05:50:32 GMT+2
Your account: arshavsky.pasha@gmail.com

Item Price

200 GB (Google One) (by Google LLC) 12.00 ₪/month

Auto-renewing subscription

Total: 12.00 ₪/month

(Includes VAT of 0.00 ₪)
`;

// Captured from a real Hyp/iPos "אישור תשלום" email. Real layout is a
// pipe-delimited bilingual table: label, then "|", then value, then "|",
// then the English label — not label-directly-followed-by-value.
const REAL_HYP_TEXT = `
| פרטי בית העסק: | נ ד 26 טכנולוגיות בעמ | Business information |
| שם הלקוח: | פבל ארשבסקי | Customer Name |
| מספר עסקה: | 436087431 | Transaction Number |
| תיאור עסקה: | CarHistory - דוח רכב 9272732 | Description |
| סטטוס: | אושרה | Status |
| סכום: | ₪9.9 | Amount |
| סוג עסקה: | רגיל | Credit Term |
| תאריך: | 2026-06-04 | Date |
| שעה: | 23:57:29 | Time |
| מספר אישור: | 0456999 | Approval number |
`;

// Captured from a real "Your Meta ads receipt" email. Labels use a colon
// directly before the value, no table markup.
const REAL_META_TEXT = `
Hi Pavel,
This is not an invoice
Payment summaryAmount billed: ₪49.98 ILS Date range: Jul 24, 2025, 12:00 AM - Jul 27, 2025, 11:59 PM Product type: Meta ads Billing reason: Ads spend since Jul 24, 2025. Payment method: MasterCard · 8021 Reference number: YBHXUTGX92
Transaction ID: 24076895071995853-10013587745419821
`;

// Captured from a real PayPal "Receipt for Your Payment" email (plaintext
// rendering, which is what stripTags() effectively reduces real HTML to).
const REAL_PAYPAL_TEXT = `
Receipt for Your Payment to Patreon
Pavel Arshavsky, you successfully sent a payment.
Hello, Pavel Arshavsky
You paid $14.50 USD to Patreon
View or Manage Payment
Transaction ID 9LU64223PH1419158
Transaction date 15 Aug 2025
Merchant Patreon noreply@patreon.com +1 0000000000
Detailed Payment Request ID charge1224622309
Description | Unit price | Qty | Amount
Patreon* Membership | $14.50 USD | 1 | $14.50 USD
Subtotal | $14.50 USD
Total | $14.50 USD
Payment | $14.50 USD
`;

describe("parseInlineReceipt", () => {
  it("parses a real captured PayPal receipt (plaintext rendering)", () => {
    const result = parseInlineReceipt("service@paypal.co.il", REAL_PAYPAL_TEXT, "Receipt for Your Payment to Patreon");
    expect(result).not.toBeNull();
    expect(result?.transactionId).toBe("9LU64223PH1419158");
    expect(result?.amount).toBeCloseTo(14.5);
    expect(result?.currency).toBe("USD");
    expect(result?.merchant).toBe("Patreon");
    expect(result?.date).toBe("2025-08-15");
  });

  it("parses a PayPal receipt", () => {
    const result = parseInlineReceipt("service@paypal.co.il", PAYPAL_HTML, "Receipt for Your Payment to Temu.com");
    expect(result).not.toBeNull();
    expect(result?.vendor).toBe("PayPal");
    expect(result?.transactionId).toBe("4CK43185JF938500R");
    expect(result?.amount).toBeCloseTo(219.14);
    expect(result?.currency).toBe("ILS");
    expect(result?.date).toBe("2024-05-30");
  });

  it("parses a real captured Google Play order receipt", () => {
    const result = parseInlineReceipt("googleplay-noreply@google.com", REAL_GOOGLE_PLAY_TEXT, "Your Google Play Order Receipt from 6 Nov 2025");
    expect(result).not.toBeNull();
    expect(result?.vendor).toBe("Google Play");
    expect(result?.transactionId).toBe("SOP.3385-8665-0643-31794..26");
    expect(result?.amount).toBeCloseTo(12);
    expect(result?.currency).toBe("ILS");
    expect(result?.date).toBe("2025-11-06");
    expect(result?.merchant).toBe("200 GB (Google One)");
  });

  it("parses a real captured Hyp/iPos receipt", () => {
    const result = parseInlineReceipt("ipos@hyp.co.il", REAL_HYP_TEXT, "אישור תשלום - נ ד 26 טכנולוגיות בעמ");
    expect(result).not.toBeNull();
    expect(result?.vendor).toBe("Hyp / iPos");
    expect(result?.transactionId).toBe("436087431");
    expect(result?.amount).toBeCloseTo(9.9);
    expect(result?.date).toBe("2026-06-04");
    expect(result?.merchant).toBe("נ ד 26 טכנולוגיות בעמ");
  });

  it("parses a real captured Meta ads receipt", () => {
    const result = parseInlineReceipt("noreply@business-updates.facebook.com", REAL_META_TEXT, "Your Meta ads receipt (Account ID: 477817139365802)");
    expect(result).not.toBeNull();
    expect(result?.vendor).toBe("Meta Ads");
    expect(result?.transactionId).toBe("24076895071995853-10013587745419821");
    expect(result?.amount).toBeCloseTo(49.98);
    expect(result?.currency).toBe("ILS");
  });

  it("parses a Google Play HTML table with the shekel glued to the price", () => {
    const html = `
      <table>
        <tr><td>Order number:</td><td>SOP.3385-8665-0643-31794..26</td></tr>
        <tr><td>Order date:</td><td>6 Nov 2025 05:50:32 GMT+2</td></tr>
        <tr><th>Item</th><th>Price</th></tr>
        <tr><td>200 GB (Google One) (by Google LLC)<br>Auto-renewing subscription</td><td>\u200f12.00\u200f₪/month</td></tr>
        <tr><td>Total:</td><td>\u200f12.00\u200f₪/month</td></tr>
      </table>
    `;
    const result = parseInlineReceipt("googleplay-noreply@google.com", html, "Your Google Play Order Receipt from 6 Nov 2025");
    expect(result?.transactionId).toBe("SOP.3385-8665-0643-31794..26");
    expect(result?.amount).toBeCloseTo(12);
    expect(result?.currency).toBe("ILS");
    expect(result?.date).toBe("2025-11-06");
    expect(result?.merchant).toBe("200 GB (Google One)");
  });

  it("parses a Google Play receipt when bidi marks wrap the shekel amount", () => {
    const text = "Order number: SOP.3385-8665-0643-31794..26\nTotal: \u200f12.00 \u200f₪/month";
    const result = parseInlineReceipt("googleplay-noreply@google.com", text, "Your Google Play Order Receipt from 6 Nov 2025");
    expect(result?.transactionId).toBe("SOP.3385-8665-0643-31794..26");
    expect(result?.amount).toBeCloseTo(12);
    expect(result?.currency).toBe("ILS");
  });

  it("parses a PayPal receipt whose amount is the You paid heading", () => {
    const html = `
      <h1>You paid $14.50 USD to Patreon</h1>
      <a>View or Manage Payment</a>
      <table>
        <tr><td>Transaction ID</td><td>9LU64223PH1419158</td></tr>
        <tr><td>Transaction date</td><td>15 Aug 2025</td></tr>
        <tr><td>Merchant</td><td>Patreon<br>noreply@patreon.com</td></tr>
      </table>
    `;
    const result = parseInlineReceipt("service@paypal.co.il", html, "Receipt for Your Payment to Patreon");
    expect(result?.transactionId).toBe("9LU64223PH1419158");
    expect(result?.amount).toBeCloseTo(14.5);
    expect(result?.currency).toBe("USD");
    expect(result?.date).toBe("2025-08-15");
    expect(result?.merchant).toBe("Patreon");
  });

  it("parses a PayPal authorization whose amount is in the heading, not a Total row", () => {
    const html = `
      <h1>You authorized a payment of ₪107.72 ILS to EBAY COMMERCE UK LTD</h1>
      <table>
        <tr><td>Transaction ID</td><td>8T061472GC5348240</td></tr>
        <tr><td>Transaction date</td><td>23 Oct 2024</td></tr>
        <tr><td>Merchant</td><td>EBAY COMMERCE UK LTD</td></tr>
        <tr><td>Instructions to merchant</td><td>You haven't entered any instructions.</td></tr>
      </table>
    `;
    const result = parseInlineReceipt("service@paypal.co.il", html, "You authorized a payment to EBAY COMMERCE UK LTD");
    expect(result?.transactionId).toBe("8T061472GC5348240");
    expect(result?.amount).toBeCloseTo(107.72);
    expect(result?.currency).toBe("ILS");
    expect(result?.date).toBe("2024-10-23");
    expect(result?.merchant).toBe("EBAY COMMERCE UK LTD");
  });

  it("parses a PayPal HTML receipt when the amount is wrapped in directional marks", () => {
    const text = "Transaction ID 8X39667271221030N\nTotal \u202a$14.50 USD\u202c";
    const result = parseInlineReceipt("service@paypal.co.il", text, "Receipt for Your Payment to Patreon");
    expect(result?.transactionId).toBe("8X39667271221030N");
    expect(result?.amount).toBeCloseTo(14.5);
    expect(result?.currency).toBe("USD");
  });

  it("parses a PayPal amount written as a numeric shekel entity", () => {
    const text = "Transaction ID 33T270597C7670523\nTotal &#8362;150.00 ILS";
    const result = parseInlineReceipt("service@paypal.co.il", text, "Receipt for Your Payment");
    expect(result?.amount).toBeCloseTo(150);
    expect(result?.currency).toBe("ILS");
  });

  it("returns null for a non-whitelisted sender", () => {
    const result = parseInlineReceipt("no-reply@grab.com", PAYPAL_HTML, "Your Grab E-Receipt");
    expect(result).toBeNull();
  });

  it("returns null when the whitelisted sender's body doesn't match the expected shape", () => {
    const result = parseInlineReceipt("service@paypal.co.il", "<p>unrelated marketing email</p>", "Special offer");
    expect(result).toBeNull();
  });
});
