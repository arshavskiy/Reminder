import { describe, expect, it } from "vitest";
import { scoreTemplateMatch } from "../templates/seedTemplates.js";
import type { DocTemplate } from "../../src/shared/types.js";

function tpl(partial: Partial<DocTemplate> & Pick<DocTemplate, "name" | "match_keywords">): DocTemplate {
  return {
    id: partial.id ?? "1",
    description: "",
    document_kind: "unknown",
    fields: [],
    expiry_field: null,
    is_default: 0,
    is_builtin: 0,
    created_at: "",
    updated_at: "",
    cached_system_prompt: null,
    ...partial,
  } as DocTemplate;
}

describe("scoreTemplateMatch", () => {
  const payslip = tpl({
    id: "payslip",
    name: "תלוש משכורת",
    is_builtin: 0,
    match_keywords: [
      "תלוש משכורת",
      "שכר יסוד",
      "סה\"כ לתשלום",
      "מס הכנסה",
      "קרן השתלמות",
      "פנסיה",
    ],
  });

  const invoice = tpl({
    id: "invoice",
    name: "חשבונית",
    is_builtin: 1,
    match_keywords: ["חשבונית", "מספר חשבונית", "תשלום"],
  });

  const invoiceNarrow = tpl({
    id: "invoice-narrow",
    name: "חשבונית",
    is_builtin: 1,
    match_keywords: ["חשבונית", "מספר חשבונית", "חשבונית מס"],
  });

  it("prefers payslip keywords over a generic תשלום hit on invoice", () => {
    const text = [
      "תלוש משכורת",
      "גי.טי.איץ תוכנה בע\"מ",
      "שכר יסוד",
      "מס הכנסה",
      "פנסיה",
      "סה\"כ לתשלום 19885",
    ].join("\n");

    expect(scoreTemplateMatch(text, payslip)).toBeGreaterThan(scoreTemplateMatch(text, invoice));
  });

  it("does not let narrow invoice keywords steal a payslip", () => {
    const text = [
      "תלוש משכורת לחודש 10/2024",
      "שכר יסוד",
      "סה\"כ לתשלום",
    ].join("\n");

    expect(scoreTemplateMatch(text, payslip)).toBeGreaterThan(scoreTemplateMatch(text, invoiceNarrow));
    expect(scoreTemplateMatch(text, invoiceNarrow)).toBe(0);
  });

  it("scores invoice when the document really is an invoice", () => {
    const text = "חשבונית מס מספר חשבונית 12345 סכום לתשלום";
    expect(scoreTemplateMatch(text, invoiceNarrow)).toBeGreaterThan(0);
    expect(scoreTemplateMatch(text, invoiceNarrow)).toBeGreaterThan(scoreTemplateMatch(text, payslip));
  });
});
