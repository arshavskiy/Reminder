import {describe, expect, it} from "vitest";
import {normalizeExtractionFieldsForTemplate} from "../pipeline/importer";
import type {DocTemplate} from "../../src/shared/types.js";

const inspectionTemplate: DocTemplate = {
  id: 1,
  name: "תסקיר בדיקה",
  description: null,
  document_kind: "inspection_report",
  match_keywords: ["תסקיר", "בדיקה תקופתית", "פקודת הבטיחות"],
  expiry_field: "next_inspection_date",
  cached_system_prompt: null,
  is_default: 1,
  is_builtin: 1,
  created_at: "",
  updated_at: "",
  fields: [
    { key: "report_number", label_he: "מספר תסקיר", type: "text" },
    { key: "client_company", label_he: "שם החברה / תופש", type: "text" },
  ],
};

describe("normalizeExtractionFieldsForTemplate", () => {
  it("fills report_number from current inspection text and ignores previous report number", () => {
    const rawText = [
      "מספר תסקיר: 17924/484590",
      "מספר תסקיר קודם: 161748/340",
      "איש קשר: בר",
    ].join("\n");

    const fields = normalizeExtractionFieldsForTemplate(rawText, inspectionTemplate, {
      client_company: "שי מגן",
    });

    expect(fields?.report_number).toBe("17924/484590");
    expect(fields?.client_company).toBe("שי מגן");
  });

  it("keeps an existing report_number", () => {
    const fields = normalizeExtractionFieldsForTemplate("מספר תסקיר: 17924/484590", inspectionTemplate, {
      report_number: "custom",
    });

    expect(fields?.report_number).toBe("custom");
  });
});
