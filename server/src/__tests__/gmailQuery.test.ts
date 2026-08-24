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
  it("limits basic invoice searches to 12 months", () => {
    expect(buildGmailQuery("has:attachment HOT", invoiceTemplate, "basic")).toBe(
      "has:attachment {filename:pdf filename:doc filename:docx filename:xls filename:xlsx} HOT newer_than:12m",
    );
  });

  it("limits business invoice searches to 48 months", () => {
    expect(buildGmailQuery("has:attachment HOT", invoiceTemplate, "business")).toBe(
      "has:attachment {filename:pdf filename:doc filename:docx filename:xls filename:xlsx} HOT newer_than:48m",
    );
  });

  it("replaces client-provided invoice history windows with the tier window", () => {
    expect(buildGmailQuery("has:attachment HOT newer_than:36m", invoiceTemplate, "basic")).toBe(
      "has:attachment {filename:pdf filename:doc filename:docx filename:xls filename:xlsx} HOT newer_than:12m",
    );
  });

  it("does not apply invoice history limits to inspection searches", () => {
    expect(buildGmailQuery(undefined, inspectionTemplate, "basic")).toBe("has:attachment filename:pdf תסקיר");
  });
});
