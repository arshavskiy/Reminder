import {describe, expect, it} from "vitest";
import {resolveInspectionType} from "../documents/inspectionType.js";

describe("report equipment category", () => {
  it("uses the category rather than the individual machine", () => {
    expect(resolveInspectionType({document_kind: "inspection_report", extracted_fields: {equipment_description: "מכונת הרמה", checked_equipment: "מלגזה חשמלית"}})).toBe("lifting_machine");
  });
  it("ignores unrelated equipment mentioned in the body", () => {
    expect(resolveInspectionType({document_kind: "inspection_report", raw_text: "תסקיר על בדיקת קולט אויר\nמעלית בבניין"})).toBe("air_receiver");
  });
  it("prefers the report category over a specific platform description", () => {
    expect(resolveInspectionType({document_kind: "inspection_report", raw_text: "תסקיר ניסוי ובדיקה של מכונת הרמה", extracted_fields: {equipment_description: "במת הרמה"}})).toBe("lifting_machine");
  });
  it("supports serialized extraction and bidi whitespace", () => {
    expect(resolveInspectionType({document_kind: "inspection_report", extracted_fields: JSON.stringify({equipment_description: "קולט\u200f  אוויר"})})).toBe("air_receiver");
  });
  it("uses the selected generated report template", () => {
    expect(resolveInspectionType({document_kind: "generated_print_template_pdf", extracted_fields: {inspection_type: "בדיקה תקופתית"}}, "elevator")).toBe("elevator");
  });
  it("does not classify invoices or guess from body mentions", () => {
    expect(resolveInspectionType({document_kind: "invoice", file_name: "מעלית.pdf"})).toBeNull();
    expect(resolveInspectionType({document_kind: "inspection_report", raw_text: "הוראות בטיחות למעלית"})).toBeNull();
  });
});
