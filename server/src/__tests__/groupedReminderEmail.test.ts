import {describe, expect, it} from "vitest";
import {
  buildGroupedItemsTable,
  expiryFromReminderTitle,
  groupedReminderKey,
} from "../reminders/groupedReminderEmail.js";

describe("groupedReminderKey", () => {
  it("groups the same client, day, and email regardless of case", () => {
    expect(groupedReminderKey("c1", "2026-08-14", "Anous_Adnan@yahoo.com"))
      .toBe(groupedReminderKey("c1", "2026-08-14", "anous_adnan@yahoo.com"));
  });

  it("keeps different emails on the same day separate", () => {
    expect(groupedReminderKey("c1", "2026-08-14", "a@x.com"))
      .not.toBe(groupedReminderKey("c1", "2026-08-14", "b@x.com"));
  });
});

describe("buildGroupedItemsTable", () => {
  it("renders a row per contract with license and equipment", () => {
    const html = buildGroupedItemsTable([
      { contract_number: "484590/12100", equipment: "מלגזה", license_number: "180375", expiry_date: "2026-08-18" },
      { contract_number: "484590/12094", equipment: "מנוף", license_number: "", expiry_date: "2026-08-18" },
    ]);
    expect(html).toContain("תסקיר");
    expect(html).toContain("ציוד");
    expect(html).toContain("רישוי");
    expect(html).toContain("484590/12100");
    expect(html).toContain("180375");
    expect(html).toContain("מנוף");
    expect(html).toContain("—");
  });

  it("escapes HTML in cell values", () => {
    const html = buildGroupedItemsTable([
      { contract_number: "<b>x</b>", equipment: "a", license_number: "1", expiry_date: "2026-01-01" },
    ]);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
  });
});

describe("expiryFromReminderTitle", () => {
  it("reads the inspection date from the generated title", () => {
    expect(expiryFromReminderTitle("בדיקה הבאה ב-2026-08-18 | מלגזה")).toBe("2026-08-18");
  });
});
