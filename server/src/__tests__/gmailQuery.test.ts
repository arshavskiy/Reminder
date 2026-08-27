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
    expect(buildGmailQuery(undefined, invoiceTemplate, "basic")).toBe(
      'has:attachment {"חשבונית" "invoice" "receipt" "bill" "חשבונית מס" "קבלה" "דרישת תשלום" "חשבון תקופתי"} newer_than:12m',
    );
  });

  it("does not expose an admin time cap on the server default invoice query", () => {
    expect(buildGmailQuery(undefined, invoiceTemplate, "admin")).toBe(
      'has:attachment {"חשבונית" "invoice" "receipt" "bill" "חשבונית מס" "קבלה" "דרישת תשלום" "חשבון תקופתי"}',
    );
  });

  it("limits basic invoice searches to 12 months", () => {
    expect(buildGmailQuery("has:attachment HOT", invoiceTemplate, "basic")).toBe(
      "has:attachment HOT newer_than:12m",
    );
  });

  it("limits business invoice searches to 48 months", () => {
    expect(buildGmailQuery("has:attachment HOT", invoiceTemplate, "business")).toBe(
      "has:attachment HOT newer_than:48m",
    );
  });

  it("does not cap admin invoice searches with newer_than:48m", () => {
    expect(buildGmailQuery("has:attachment HOT", invoiceTemplate, "admin")).toBe(
      "has:attachment HOT",
    );
    expect(buildGmailQuery("has:attachment HOT newer_than:48m", invoiceTemplate, "admin")).toBe(
      "has:attachment HOT",
    );
  });

  it("replaces client-provided invoice history windows with the tier window", () => {
    expect(buildGmailQuery("has:attachment HOT newer_than:36m", invoiceTemplate, "basic")).toBe(
      "has:attachment HOT newer_than:12m",
    );
  });

  it("removes invoice file-type filters without adding them back", () => {
    expect(buildGmailQuery("has:attachment {filename:pdf filename:docx} invoice", invoiceTemplate, "basic")).toBe(
      "has:attachment invoice newer_than:12m",
    );
  });

    it("caps inspection searches at 18 months", () => {
        expect(buildGmailQuery(undefined, inspectionTemplate, "basic")).toBe(
            "has:attachment {filename:pdf filename:doc filename:docx} תסקיר newer_than:18m",
        );
        expect(buildGmailQuery(
            "has:attachment {filename:pdf filename:doc filename:docx} {\"תסקיר\"} newer_than:6m",
            inspectionTemplate,
            "business",
        )).toBe(
            'has:attachment {filename:pdf filename:doc filename:docx} {"תסקיר"} newer_than:18m',
        );
  });
});
