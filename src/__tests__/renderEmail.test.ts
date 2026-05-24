import { describe, it, expect } from "vitest";
import { renderTemplate, listTemplateVars } from "../templates/renderEmail.js";

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
