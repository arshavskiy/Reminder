import {describe, expect, it} from "vitest";
import type {EmailVars} from "../templates/renderEmail.js";
import {listTemplateVars, renderTemplate} from "../templates/renderEmail.js";
import {loadReminderTemplate} from "../email-templates/loader.js";
import {prepareGroupedTemplateHtml} from "../reminders/groupedReminderEmail.js";

describe("renderTemplate", () => {
  it("substitutes a simple variable", () => {
    expect(renderTemplate("Hello {{name}}", { name: "World" }, { escape: false })).toBe("Hello World");
  });

  it("escapes HTML by default", () => {
    const out = renderTemplate("{{val}}", { val: "<script>alert(1)</script>" });
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script>");
  });

  it("does not escape when escape:false", () => {
    const out = renderTemplate("{{val}}", { val: "<b>bold</b>" }, { escape: false });
    expect(out).toBe("<b>bold</b>");
  });

  it("uses fallback when variable is missing", () => {
    expect(renderTemplate("{{name|ברירת מחדל}}", {}, { escape: false })).toBe("ברירת מחדל");
  });

  it("uses fallback when variable is empty string", () => {
    expect(renderTemplate("{{name|fallback}}", { name: "" }, { escape: false })).toBe("fallback");
  });

  it("uses fallback when variable is null", () => {
    expect(renderTemplate("{{name|fallback}}", { name: null }, { escape: false })).toBe("fallback");
  });

  it("uses the value when present, ignoring fallback", () => {
    expect(renderTemplate("{{name|fallback}}", { name: "Alice" }, { escape: false })).toBe("Alice");
  });

  it("renders an #if block when variable is truthy", () => {
    const tpl = "{{#if phone}}<p>{{phone}}</p>{{/if}}";
    expect(renderTemplate(tpl, { phone: "050-111" }, { escape: false })).toBe("<p>050-111</p>");
  });

  it("removes an #if block when variable is falsy", () => {
    expect(renderTemplate("{{#if phone}}<p>{{phone}}</p>{{/if}}", {}, { escape: false })).toBe("");
  });

  it("removes an #if block when variable is empty string", () => {
    expect(renderTemplate("{{#if phone}}<p>yes</p>{{/if}}", { phone: "" }, { escape: false })).toBe("");
  });

  it("handles multiple variables in one template", () => {
    const out = renderTemplate("{{a}} + {{b}} = {{c}}", { a: "1", b: "2", c: "3" }, { escape: false });
    expect(out).toBe("1 + 2 = 3");
  });

  it("handles number values", () => {
    expect(renderTemplate("{{count}}", { count: 42 }, { escape: false })).toBe("42");
  });

  it("leaves unknown variables as empty string", () => {
    expect(renderTemplate("{{missing}}", {}, { escape: false })).toBe("");
  });

  it("handles nested #if + variable substitution", () => {
    const tpl = "{{#if logo_url}}<img src='{{logo_url}}'>{{/if}}";
    expect(renderTemplate(tpl, { logo_url: "http://x.com/logo.png" }, { escape: false }))
      .toBe("<img src='http://x.com/logo.png'>");
    expect(renderTemplate(tpl, {}, { escape: false })).toBe("");
  });
});

describe("listTemplateVars", () => {
  it("returns empty array for a template with no vars", () => {
    expect(listTemplateVars("<p>Hello</p>")).toEqual([]);
  });

  it("extracts simple variable names", () => {
    const vars = listTemplateVars("{{title}} — {{client_company}}");
    expect(vars).toContain("title");
    expect(vars).toContain("client_company");
  });

  it("deduplicates repeated variables", () => {
    const vars = listTemplateVars("{{name}} {{name}} {{name}}");
    expect(vars.filter((v) => v === "name")).toHaveLength(1);
  });

  it("extracts variables from #if blocks", () => {
    const vars = listTemplateVars("{{#if phone}}<p>{{phone}}</p>{{/if}}");
    expect(vars).toContain("phone");
  });

  it("extracts variables with fallback syntax", () => {
    const vars = listTemplateVars("{{title|ללא כותרת}}");
    expect(vars).toContain("title");
  });

  it("extracts all variables from a full email template", () => {
    const tpl = `
      <h2>{{title}}</h2>
      <p>{{client_company}}</p>
      {{#if contact_person}}<p>{{contact_person}}</p>{{/if}}
      <p>{{expiry_date|לא ידוע}}</p>
    `;
    const vars = listTemplateVars(tpl);
    expect(vars).toContain("title");
    expect(vars).toContain("client_company");
    expect(vars).toContain("contact_person");
    expect(vars).toContain("expiry_date");
  });
});

describe("reminder email templates — full data fill", () => {
  // Mirrors buildEmailVars() in reminders/emailSender.ts when the reminder is
  // linked to both a client and a document/contract.
  const FULL_VARS: EmailVars = {
    title: "בדיקה הבאה ב-2026-11-22",
    trigger_date: "2026-10-22",
    advance_days: 30,
    body: "הערה לבדיקה",
    client_name: "יוסי כהן",
    document_name: "תסקיר 18163.pdf",
    from_name: "RemindOCR",
    client_company: "מן הנדסת חשמל",
    contact_email: "office@example.com",
    contact_phone: "052-1234567",
    contact_person: "יוסי כהן",
    client_address: "העצמאות 36, אשדוד",
    document_type: "תסקיר בדיקה",
    document_number: "484590/18163",
    contract_number: "18163",
    contract_type: "בדיקה הידראולית",
    start_date: "2026-07-22",
    expiry_date: "2026-11-22",
    amount: 1200,
    currency: "ILS",
    equipment_type: "lift",
    manufacturer: "Ferrari",
    model: "AGLY2",
    serial_number: "2305001938",
    logo_url: null,
  };

  // Only the fields ALWAYS available for any reminder — buildEmailVars() only
  // populates document_type/document_number/contract_*/expiry_date/amount when
  // reminder.document_id is set. Contract-only reminders (e.g. the manual
  // hydraulic-check flow, or the equipment-XLSX-import stub-contract path)
  // have document_id: null, so those fields are never present.
  const MINIMAL_VARS: EmailVars = {
    title: "בדיקה הבאה ב-2026-11-22",
    trigger_date: "2026-10-22",
    advance_days: 30,
    body: null,
    client_name: "יוסי כהן",
    document_name: null,
    from_name: "RemindOCR",
    client_company: "מן הנדסת חשמל",
    contact_email: "office@example.com",
    contact_phone: "052-1234567",
    logo_url: null,
  };

  // Simulates a reminder whose linked client/document has since been deleted.
  const BARE_VARS: EmailVars = {
    title: "תזכורת",
    trigger_date: "2026-01-01",
    advance_days: 30,
  };

  const TEMPLATES = ["default", "inspection", "contract", "invoice", "grouped"] as const;
  const VAR_SETS = [
    ["full", FULL_VARS],
    ["minimal (contract-only reminder)", MINIMAL_VARS],
    ["bare (no client/equipment)", BARE_VARS],
  ] as const;

  function findUnresolvedTokens(html: string): string[] {
    return html.match(/\{\{[^}]*\}\}|\{\s*\{[^}]*\}\s*\}/g) ?? [];
  }

  for (const name of TEMPLATES) {
    // Stray-space variants like "{ {var}}" silently bypass the renderer's
    // regex and leak into the sent email as literal text.
    it(`${name}.html has no malformed brace tokens in source`, () => {
      const raw = loadReminderTemplate(name);
      // CSS closes nested blocks (media queries) with "}\n}", which is not a token.
      const markup = raw.replace(/<style[\s\S]*?<\/style>/gi, "");
      expect(markup.match(/\{\s+\{|\}\s+\}/g)).toBeNull();
    });

    for (const [varsLabel, vars] of VAR_SETS) {
      it(`${name}.html resolves all tokens with ${varsLabel} vars`, () => {
        const raw = loadReminderTemplate(name);
        const rendered = renderTemplate(raw, vars, { escape: false });
        expect(findUnresolvedTokens(rendered)).toEqual([]);
      });
    }
  }
});

describe("grouped items_table injection in built-in templates", () => {
  const TABLE_VARS: EmailVars = {
    title: "בדיקה הבאה ב-2026-11-22",
    trigger_date: "2026-10-22",
    advance_days: 30,
    body: "הערה לבדיקה",
    from_name: "RemindOCR",
    client_company: "מן הנדסת חשמל",
    contact_person: "יוסי כהן",
    contact_phone: "052-1234567",
    document_type: "תסקיר בדיקה",
    document_number: "484590/18163",
    expiry_date: "2026-11-22",
    equipment_type: "lift",
    manufacturer: "Ferrari",
    model: "AGLY2",
    serial_number: "2305001938",
  };
  const SAMPLE_TABLE = `<table class="items"><thead><tr><th>תסקיר</th><th>ציוד</th><th>בתוקף עד</th></tr></thead><tbody><tr><td>484590/12100</td><td>מלגזה</td><td>2026-08-18</td></tr></tbody></table>`;

  it("inspection.html without items_table still shows the single equipment box", () => {
    const rendered = renderTemplate(loadReminderTemplate("inspection"), TABLE_VARS, { escape: false });
    expect(rendered).toContain("פרטי הבדיקה");
    expect(rendered).toContain("פרטי הציוד");
    expect(rendered).toContain("cta-box");
    expect(rendered).not.toContain("פריטים לבדיקה");
    expect(rendered).not.toContain("בתוקף עד");
  });

  it("inspection.html with items_table injects after פרטי הבדיקה and keeps the layout", () => {
    const rendered = renderTemplate(loadReminderTemplate("inspection"), {
      ...TABLE_VARS,
      items_table: SAMPLE_TABLE,
    }, { escape: false });
    expect(rendered.indexOf("פריטים לבדיקה")).toBeGreaterThan(rendered.indexOf("פרטי הבדיקה"));
    expect(rendered.indexOf("בתוקף עד")).toBeGreaterThan(rendered.indexOf("פריטים לבדיקה"));
    expect(rendered.indexOf("בתוקף עד")).toBeLessThan(rendered.indexOf("class=\"equipment-box\""));
    expect(rendered).toContain("cta-box");
    expect(rendered).toContain("תזכורת לבדיקה תקופתית");
  });

  it("default.html renders the single reminder without a grouped table", () => {
    const rendered = renderTemplate(loadReminderTemplate("default"), TABLE_VARS, { escape: false });
    expect(rendered).toContain("מתקרב מועד הבדיקה התקופתית");
    expect(rendered).not.toContain("פריטים לבדיקה");
    expect(rendered).not.toContain("בתוקף עד");
  });

  it("default.html gets the grouped table injected inside the body", () => {
    // The template has no {{items_table}} token; grouped sends inject the table.
    const source = prepareGroupedTemplateHtml(loadReminderTemplate("default"), SAMPLE_TABLE);
    const rendered = renderTemplate(source, TABLE_VARS, { escape: false });
    expect(rendered.indexOf("פריטים לבדיקה")).toBeGreaterThan(rendered.indexOf("<body"));
    expect(rendered).toContain("בתוקף עד");
    expect(rendered).toContain("484590/12100");
  });
});
