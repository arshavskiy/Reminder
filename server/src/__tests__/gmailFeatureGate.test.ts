import { describe, expect, it } from "vitest";
import { gmailRequiredFeatures } from "../gmail/featureGate";

describe("gmailRequiredFeatures", () => {
  it("lets the invoices page import without the Gmail page", () => {
    for (const path of ["/import-all", "/import-retry", "/import-jobs/abc", "/import-history", "/inbox", "/import-attachment"]) {
      expect(gmailRequiredFeatures(path), path).toContain("pages.invoices");
      expect(gmailRequiredFeatures(path), path).toContain("pages.gmail");
    }
  });
  it("keeps discovery routes on pages.discovery alone", () => {
    expect(gmailRequiredFeatures("/obligation/scan")).toEqual(["pages.discovery"]);
    expect(gmailRequiredFeatures("/obligation/saved/x/pdf/y")).toEqual(["pages.discovery"]);
  });
  it("shares the connection routes between gmail, invoices and discovery", () => {
    expect(gmailRequiredFeatures("/status")).toEqual(["pages.gmail", "pages.invoices", "pages.discovery"]);
    expect(gmailRequiredFeatures("/auth-url")).toEqual(["pages.gmail", "pages.invoices", "pages.discovery"]);
  });
  it("does not treat a lookalike prefix as a discovery route", () => {
    expect(gmailRequiredFeatures("/obligations-export")).not.toContain("pages.discovery");
  });
});
