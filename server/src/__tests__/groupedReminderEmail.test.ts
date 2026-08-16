import {describe, expect, it} from "vitest";
import {
  buildGroupedItemsTable,
  expiryFromReminderTitle,
  groupedReminderKey,
  hasItemsTablePlaceholder,
  injectItemsTable,
  normalizeItemsTableTokens,
  prepareGroupedTemplateHtml,
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

describe("injectItemsTable", () => {
  const table = buildGroupedItemsTable([
    { contract_number: "484590/12100", equipment: "מלגזה", license_number: "180375", expiry_date: "2026-08-18" },
  ]);

  it("detects {{items_table}} and {{{items_table}}} placeholders", () => {
    expect(hasItemsTablePlaceholder("{{items_table}}")).toBe(true);
    expect(hasItemsTablePlaceholder("{{{items_table}}}")).toBe(true);
    expect(hasItemsTablePlaceholder("{{#if items_table}}{{items_table}}{{/if}}")).toBe(true);
    expect(hasItemsTablePlaceholder("<div class=\"cta-box\"></div>")).toBe(false);
  });

  it("normalizes triple-stash tokens for the email renderer", () => {
    expect(normalizeItemsTableTokens("before {{{items_table}}} after")).toBe("before {{items_table}} after");
  });

  it("leaves templates with a placeholder unchanged", () => {
    const html = "<body><p>{{items_table}}</p><div class=\"cta-box\">cta</div></body>";
    expect(injectItemsTable(html, table)).toBe(html);
  });

  it("inserts before the CTA box", () => {
    const html = `<html><body>
      <table class="fields"><tr><td>details</td></tr></table>
      <div class="cta-box"><p>cta</p></div>
      <div class="footer">footer</div>
    </body></html>`;
    const out = injectItemsTable(html, table);
    expect(out.indexOf("בתוקף עד")).toBeGreaterThan(out.indexOf("details"));
    expect(out.indexOf("בתוקף עד")).toBeLessThan(out.indexOf("cta-box"));
    expect(out).toContain("פריטים לבדיקה");
  });

  it("inserts before the footer when there is no CTA", () => {
    const html = `<html><body>
      <table class="fields"><tr><td>details</td></tr></table>
      <div class="footer">footer</div>
    </body></html>`;
    const out = injectItemsTable(html, table);
    expect(out.indexOf("class=\"items\"")).toBeLessThan(out.indexOf("class=\"footer\""));
  });

  it("inserts before </body> as a last resort", () => {
    const html = "<html><body><p>hello</p></body></html>";
    const out = injectItemsTable(html, table);
    expect(out).toContain("class=\"items\"");
    expect(out.indexOf("class=\"items\"")).toBeLessThan(out.indexOf("</body>"));
  });

  it("prepareGroupedTemplateHtml injects when the placeholder is missing", () => {
    const html = "<html><body><div class=\"cta-box\">go</div></body></html>";
    const out = prepareGroupedTemplateHtml(html, table);
    expect(out).toContain("484590/12100");
    expect(out.indexOf("484590/12100")).toBeLessThan(out.indexOf("cta-box"));
  });
});
