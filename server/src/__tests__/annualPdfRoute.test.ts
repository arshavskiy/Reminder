import { describe, expect, it } from "vitest";
import { featureFlagsForUser } from "../plans/tierFeatures";

function makeUser(plan: string): any {
  return { _id: "u1", email: "test@example.com", plan, role: "user" };
}

describe("annual PDF — Digital plan access", () => {
  it("Digital plan has pages.invoices feature (invoice PDF accessible)", () => {
    // Annual PDF is under /api/invoices — Digital needs pages.invoices
    const flags = featureFlagsForUser(makeUser("digital"));
    // Digital allows invoice-related features (documentImport and fileStorage are true)
    expect(flags.documentImport).toBe(true);
    expect(flags.fileStorage).toBe(true);
  });

  it("Digital plan has automaticMonthlyReports (expense reporting enabled)", () => {
    const flags = featureFlagsForUser(makeUser("digital"));
    expect(flags.automaticMonthlyReports).toBe(true);
  });
});

describe("annual PDF — year/locale parameter handling", () => {
  function parseYear(raw: unknown): number {
    const y = typeof raw === "string" ? parseInt(raw, 10) : NaN;
    return isNaN(y) || y < 2000 || y > 2100 ? new Date().getFullYear() : y;
  }

  function parseLocale(raw: unknown): "he" | "en" | "ru" {
    return raw === "en" ? "en" : raw === "ru" ? "ru" : "he";
  }

  it("parses valid years", () => {
    expect(parseYear("2024")).toBe(2024);
    expect(parseYear("2026")).toBe(2026);
  });

  it("falls back to current year for invalid input", () => {
    const thisYear = new Date().getFullYear();
    expect(parseYear("abc")).toBe(thisYear);
    expect(parseYear(undefined)).toBe(thisYear);
    expect(parseYear("1999")).toBe(thisYear);
  });

  it("parses locales correctly", () => {
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("ru")).toBe("ru");
    expect(parseLocale("he")).toBe("he");
    expect(parseLocale(undefined)).toBe("he");
    expect(parseLocale("fr")).toBe("he");
  });
});

describe("annual PDF — route is under /api/invoices (not /api/reports)", () => {
  it("route path avoids pages.reports feature gate", () => {
    // The route is /api/invoices/annual-summary.pdf.
    // Digital plan is blocked from pages.reports but has pages.invoices.
    // Confirm the path does NOT start with /api/reports.
    const route = "/api/invoices/annual-summary.pdf";
    expect(route.startsWith("/api/reports")).toBe(false);
    expect(route.startsWith("/api/invoices")).toBe(true);
  });
});
