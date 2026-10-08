import { describe, expect, it } from "vitest";
import { applyFamilyFeatureOverlay, applyPlanFeatureOverlay, FAMILY_ALLOWED_FEATURES, isFamilyPlan } from "../plans/planFeatures";
import { FEATURE_DEFINITIONS } from "../features";

const KEYS = FEATURE_DEFINITIONS.map((feature) => feature.key);
const everythingOn = Object.fromEntries(KEYS.map((key) => [key, true]));

describe("family tier page overlay", () => {
  it("recognises only an active digital account", () => {
    expect(isFamilyPlan({ plan: "digital" })).toBe(true);
    for (const plan of ["basic", "business"]) expect(isFamilyPlan({ plan })).toBe(false);
    expect(isFamilyPlan({ plan: "business", role: "admin" })).toBe(false);
  });

  it("shows only the dashboard, reminders, invoices, discovery, profile, documents and gmail pages", () => {
    const flags = applyFamilyFeatureOverlay(everythingOn, KEYS);
    const onPages = KEYS.filter((key) => key.startsWith("pages.") && flags[key]);
    expect(onPages.sort()).toEqual(["pages.dashboard", "pages.discovery", "pages.documents", "pages.gmail", "pages.invoices", "pages.profile", "pages.reminders"]);
    for (const hidden of ["pages.contracts", "pages.clients", "pages.equipment", "pages.field", "pages.reports", "pages.doc_templates", "pages.email_templates", "pages.settings", "pages.search"]) {
      expect(flags[hidden], hidden).toBe(false);
    }
  });

  it("keeps only reminder and calendar widgets on the dashboard", () => {
    const flags = applyFamilyFeatureOverlay(everythingOn, KEYS);
    const onWidgets = KEYS.filter((key) => key.startsWith("dashboard.") && flags[key]).sort();
    expect(onWidgets).toEqual(["dashboard.calendar", "dashboard.stat_pending_reminders", "dashboard.upcoming_reminders"]);
    for (const hidden of ["dashboard.stat_documents", "dashboard.stat_clients", "dashboard.stat_inspections", "dashboard.stat_expiring_soon", "dashboard.drop_strip", "dashboard.recent_documents", "dashboard.calendar_filters", "dashboard.modules"]) {
      expect(flags[hidden], hidden).toBe(false);
    }
  });

  it("turns discovery on even though it is off by default elsewhere", () => {
    const stored = { ...everythingOn, "pages.discovery": false };
    expect(applyFamilyFeatureOverlay(stored, KEYS)["pages.discovery"]).toBe(true);
  });

  it("never lets stored toggles open a page outside the tier", () => {
    const flags = applyFamilyFeatureOverlay({ "pages.clients": true, "pages.reports": true }, KEYS);
    expect(flags["pages.clients"]).toBe(false);
    expect(flags["pages.reports"]).toBe(false);
  });

  it("leaves every other plan untouched", () => {
    expect(applyPlanFeatureOverlay({ plan: "basic" }, everythingOn, KEYS)).toBe(everythingOn);
    expect(applyPlanFeatureOverlay({ plan: "business" }, null, KEYS)).toBeNull();
  });

  it("allows exactly the documented set", () => {
    expect([...FAMILY_ALLOWED_FEATURES].sort()).toEqual([
      "dashboard.calendar", "dashboard.stat_pending_reminders", "dashboard.upcoming_reminders",
      "pages.dashboard", "pages.discovery", "pages.documents", "pages.gmail", "pages.invoices", "pages.profile", "pages.reminders",
    ]);
  });
});
