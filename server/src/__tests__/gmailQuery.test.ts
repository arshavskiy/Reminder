import { describe, expect, it } from "vitest";
import { buildGmailQuery } from "../routes/gmail";

const invoiceTemplate = {
  name: "חשבונית",
  document_kind: "invoice",
} as any;

const inspectionTemplate = {
  name: "תסקיר",
  document_kind: "inspection_report",
} as any;

describe("Gmail query tier limits", () => {
  it("builds the default invoice import query on the server", () => {
    // Basic has no invoice backfill, so no time window is appended.
    expect(buildGmailQuery(undefined, invoiceTemplate, "basic")).toBe(
      'has:attachment {"חשבונית" "חשבוניות" "invoice" "receipt" "receipts" "bill" "חשבונית מס" "קבלה" "קבלות" "דרישת תשלום" "חשבון תקופתי" "чек" "кассовый чек" "квитанция" "счет" "счёт" "счет-фактура" "электронные билеты" "маршрутная квитанция" "товарный чек" "счет на оплату" "счёт на оплату" "счёт-фактура" "УПД" "акт выполненных работ" "накладная" "квитанция на оплату" "единый платежный документ" "подтверждение оплаты" "оплата" "платеж" "платёж" "электронный билет"}',
    );
  });

  it("does not expose an admin time cap on the server default invoice query", () => {
    expect(buildGmailQuery(undefined, invoiceTemplate, "admin")).toBe(
      'has:attachment {"חשבונית" "חשבוניות" "invoice" "receipt" "receipts" "bill" "חשבונית מס" "קבלה" "קבלות" "דרישת תשלום" "חשבון תקופתי" "чек" "кассовый чек" "квитанция" "счет" "счёт" "счет-фактура" "электронные билеты" "маршрутная квитанция" "товарный чек" "счет на оплату" "счёт на оплату" "счёт-фактура" "УПД" "акт выполненных работ" "накладная" "квитанция на оплату" "единый платежный документ" "подтверждение оплаты" "оплата" "платеж" "платёж" "электронный билет"}',
    );
  });

  it("gives basic no invoice history, since backfill is a business feature", () => {
    expect(buildGmailQuery("has:attachment HOT", invoiceTemplate, "basic")).toBe(
      "has:attachment HOT",
    );
  });

  it("limits trial invoice searches to three months", () => {
    // Enough to demonstrate the import on recent receipts, without offering the
    // historical backfill that business pays for.
    expect(buildGmailQuery("has:attachment HOT", invoiceTemplate, "trial")).toBe(
      "has:attachment HOT newer_than:3m",
    );
  });

  it("limits business invoice searches to 36 months", () => {
    // Invoices reach further back than inspections: three tax years of expense
    // history, against 24 months for inspections.
    expect(buildGmailQuery("has:attachment HOT", invoiceTemplate, "business")).toBe(
      "has:attachment HOT newer_than:36m",
    );
  });

  it("does not cap admin invoice searches with newer_than:24m", () => {
    expect(buildGmailQuery("has:attachment HOT", invoiceTemplate, "admin")).toBe(
      "has:attachment HOT",
    );
    expect(buildGmailQuery("has:attachment HOT newer_than:24m", invoiceTemplate, "admin")).toBe(
      "has:attachment HOT",
    );
  });

  it("replaces client-provided invoice history windows with the tier window", () => {
    // A client asking for 36 months gets its tier's window, not what it asked for.
    expect(buildGmailQuery("has:attachment HOT newer_than:36m", invoiceTemplate, "trial")).toBe(
      "has:attachment HOT newer_than:3m",
    );
  });

  it("strips a client-provided window entirely when the tier has no backfill", () => {
    expect(buildGmailQuery("has:attachment HOT newer_than:36m", invoiceTemplate, "basic")).toBe(
      "has:attachment HOT",
    );
  });

  it("removes invoice file-type filters without adding them back", () => {
    expect(buildGmailQuery("has:attachment {filename:pdf filename:docx} invoice", invoiceTemplate, "basic")).toBe(
      "has:attachment invoice",
    );
  });

    it("caps inspection searches by tier", () => {
        expect(buildGmailQuery(undefined, inspectionTemplate, "basic")).toBe(
            "has:attachment {filename:pdf filename:doc filename:docx} תסקיר newer_than:16m",
        );
        expect(buildGmailQuery(
            "has:attachment {filename:pdf filename:doc filename:docx} {\"תסקיר\"} newer_than:6m",
            inspectionTemplate,
            "business",
        )).toBe(
            'has:attachment {filename:pdf filename:doc filename:docx} {"תסקיר"} newer_than:24m',
        );
  });
});
