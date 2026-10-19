import {describe, expect, it} from "vitest";
import catalog from "../../../client/src/shared/pricingCatalog.json";
import {formatPlanPrice, getPricingPlanForLocale, planBillingTerms, planPurchaseUrl, plansForLocale, yearlyMonthly} from "../../../client/src/shared/pricingPlans";

describe("shared pricing catalog", () => {
  it("keeps approved annual rates separate from monthly billing", () => {
    const digital = getPricingPlanForLocale("digital", "he");
    const basic = getPricingPlanForLocale("basic", "he");
    const business = getPricingPlanForLocale("business", "he");
    expect([digital.price, yearlyMonthly(digital), digital.yearlyPrice]).toEqual([49, 39, 468]);
    expect([basic.price, yearlyMonthly(basic), basic.yearlyPrice]).toEqual([97, 78, 936]);
    expect([business.price, yearlyMonthly(business), business.yearlyPrice]).toEqual([149, 119, 1428]);
    for (const locale of ["he", "en"] as const) {
      for (const plan of plansForLocale(locale).filter((item) => item.id !== "trial")) {
        expect(plan.price).toBeGreaterThan(0);
        expect(plan.yearlyPrice).toBeLessThan(plan.price * 12);
        expect(yearlyMonthly(plan) * 12).toBe(plan.yearlyPrice);
      }
    }
  });

  it("names the plans Starter and Pro while keeping the internal ids", () => {
    expect(getPricingPlanForLocale("basic", "en").name).toBe("Starter");
    expect(getPricingPlanForLocale("business", "en").name).toBe("Pro");
    expect(getPricingPlanForLocale("basic", "he").name).toBe("סטארטר");
    expect(getPricingPlanForLocale("business", "he").name).toBe("פרו");
    expect(getPricingPlanForLocale("business", "ru").name).toBe("Pro");
  });

  it.each(["he", "en"] as const)("quotes the correct currency and billing alternatives in %s", (locale) => {
    const appPlans = plansForLocale(locale);
    expect(appPlans.map((plan) => plan.id)).toEqual(["trial", "digital", "basic", "business"]);
    for (const appPlan of appPlans.filter((plan) => plan.id !== "trial")) {
      const quote = new URL(planPurchaseUrl(appPlan, locale));
      expect(quote.hostname).toBe("wa.me");
      expect(quote.searchParams.get("text")).toContain(appPlan.name);
      expect(quote.searchParams.get("text")).toContain(catalog.locales[locale].symbol);
      expect(quote.searchParams.get("text")).toContain(String(appPlan.price));
      expect(quote.searchParams.get("text")).not.toContain("שנתי");
      expect(quote.searchParams.get("text")).not.toContain("yearly");
      expect(quote.searchParams.get("text")).toContain(planBillingTerms(appPlan, locale));
    }
  });

  it("does not present an expired account as a new free trial", () => {
    for (const locale of ["he", "en"] as const) {
      const expired = getPricingPlanForLocale("expired", locale);
      expect(expired.id).toBe("expired");
      expect(expired.features).toEqual([]);
      expect(expired.name).not.toBe(getPricingPlanForLocale("trial", locale).name);
      expect(formatPlanPrice(expired, locale)).toBe(catalog.locales[locale].expiredName);
    }
  });
});
