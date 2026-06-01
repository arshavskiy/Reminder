import {describe, expect, it} from "vitest";
import {buildPromptForTemplate} from "../templates/buildPrompt";
import type {DocTemplate} from "../../src/shared/types.js";

function inspectionTemplate(): DocTemplate {
  return {
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
      { key: "contact_person", label_he: "איש קשר", type: "text" },
      { key: "contact_phone", label_he: "נייד", type: "phone" },
      { key: "contact_email", label_he: "מייל", type: "email" },
    ],
  };
}

describe("buildPromptForTemplate", () => {
  it("anchors inspection contact fields to the client details block", () => {
    const prompt = buildPromptForTemplate(inspectionTemplate());

    expect(prompt).toContain("contact_person, contact_phone, and contact_email must come from the CLIENT / HOLDER details block");
    expect(prompt).toContain("איש קשר: בר");
    expect(prompt).toContain("053-8801490");
    expect(prompt).toContain("benitaliftingplat@gmail.com");
    expect(prompt).toContain("Never take contact_person/phone/email from the page footer");
  });

  it("requires equipment work-load values to stay table-sourced arrays", () => {
    const prompt = buildPromptForTemplate(inspectionTemplate());

    expect(prompt).toContain('"load_capacity_work": string[]');
    expect(prompt).toContain('equipment table column/header "עומס עבודה בטוח');
    expect(prompt).toContain("One entry per load configuration");
    expect(prompt).toContain("empty array only if truly no equipment");
  });
});
