import { describe, expect, it } from "vitest";
import { buildInlineReceiptQueries, classifyNoAttachmentEmail } from "../gmail/inlineReceiptDetect";

const GOOGLE_PLAY = `
Order number: SOP.3385-8665-0643-31794..26
Order date: 6 Nov 2025 05:50:32 GMT+2
Item Price
200 GB (Google One) (by Google LLC) 12.00 ₪/month
Total: 12.00 ₪/month
`;

const PAYPAL = `
Receipt for Your Payment to Patreon
Transaction ID 9LU64223PH1419158
Transaction date 15 Aug 2025
You paid $14.50 USD to Patreon
Total | $14.50 USD
`;

describe("classifyNoAttachmentEmail", () => {
  it("keeps a Google Play order receipt that has no HTML table and no document link", () => {
    const result = classifyNoAttachmentEmail({
      from: "Google Play <googleplay-noreply@google.com>",
      subject: "Your Google Play Order Receipt from 6 Nov 2025",
      html: null,
      plain: GOOGLE_PLAY,
      documentLinkUrl: null,
    });
    expect(result).toEqual({ kind: "inline", documentLinkUrl: null, importable: true });
  });

  it("keeps a PayPal payment receipt that is plain text", () => {
    const result = classifyNoAttachmentEmail({
      from: "PayPal <service@paypal.com>",
      subject: "Receipt for Your Payment to Patreon",
      html: null,
      plain: PAYPAL,
      documentLinkUrl: null,
    });
    expect(result?.kind).toBe("inline");
    expect(result?.importable).toBe(true);
  });

  it("still lists a known receipt when the body cannot be parsed", () => {
    const result = classifyNoAttachmentEmail({
      from: "Google Play <googleplay-noreply@google.com>",
      subject: "Your Google Play Order Receipt from 1 Jan 2024",
      html: "<html><body>Thanks for your order.</body></html>",
      plain: null,
      documentLinkUrl: null,
    });
    expect(result).toEqual({ kind: "inline", documentLinkUrl: null, importable: false });
  });

  it("keeps a document link that is not an inline receipt", () => {
    const result = classifyNoAttachmentEmail({
      from: "Green Invoice <billing@greeninvoice.co.il>",
      subject: "חשבונית מס 1001",
      html: null,
      plain: null,
      documentLinkUrl: "https://example.com/doc/1001",
    });
    expect(result).toEqual({
      kind: "link",
      documentLinkUrl: "https://example.com/doc/1001",
      importable: false,
    });
  });

  it("ignores mail that is neither a receipt nor a document link", () => {
    expect(classifyNoAttachmentEmail({
      from: "News <news@example.com>",
      subject: "Weekly update",
      html: "<p>Hello</p>",
      plain: "Hello",
      documentLinkUrl: null,
    })).toBeNull();
  });
});

describe("buildInlineReceiptQueries", () => {
  const plans = buildInlineReceiptQueries("has:attachment {invoice receipt חשבונית}", 36);

  it("does not spend the scan on emails that already have a document file", () => {
    for (const plan of plans) {
      expect(plan.query).toContain("-filename:pdf");
      expect(plan.query).not.toMatch(/\bhas:attachment\b/);
    }
  });

  it("searches Google Play and PayPal directly, inside the invoice history window", () => {
    const joined = plans.map((plan) => plan.query).join("\n");
    expect(joined).toContain("from:googleplay-noreply@google.com");
    expect(joined).toContain("from:paypal.com");
    expect(joined).toContain("newer_than:36m");
    expect(plans.reduce((sum, plan) => sum + plan.budget, 0)).toBeGreaterThan(500);
  });
});
