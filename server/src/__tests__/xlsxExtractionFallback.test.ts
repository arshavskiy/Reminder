import {describe, expect, it} from "vitest";
import {forwardPastNextActionDate, normalizeExtractionFieldsForTemplate} from "../pipeline/importer";
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
    { key: "contact_person", label_he: "איש קשר", type: "text" },
    { key: "contact_phone", label_he: "נייד", type: "phone" },
    { key: "contact_email", label_he: "מייל", type: "email" },
    { key: "client_address", label_he: "ישוב / רחוב", type: "text" },
    { key: "po_box", label_he: "ת.ד", type: "text" },
    { key: "client_zipcode", label_he: "מיקוד", type: "text" },
    { key: "equipment_description", label_he: "תיאור", type: "text" },
    { key: "checked_equipment", label_he: "ציוד שנבדק", type: "text" },
    { key: "license_number", label_he: "מספר רישוי", type: "text" },
  ],
};

describe("normalizeExtractionFieldsForTemplate", () => {
  it("forwards a past next-action date to the next future year", () => {
    expect(forwardPastNextActionDate("2026-07-15", new Date(2026, 7, 9))).toBe("2027-07-15");
  });

  it("forwards a past next-action date using the start-to-next-date interval", () => {
    expect(forwardPastNextActionDate("2025-08-16", new Date(2026, 7, 9), "2025-02-17")).toBe("2026-08-16");
  });

  it("uses an 18-month start-to-expiry interval when the document dates show it", () => {
    const fields = normalizeExtractionFieldsForTemplate("תסקיר בדיקה", inspectionTemplate, {
      start_date: "2025-02-17",
      next_inspection_date: "2026-08-16",
    });

    expect(fields?.next_inspection_date).toBe("2026-08-16");
    expect(fields?.inspection_interval_months).toBe(18);
    expect(fields?.date_diff_months).toBe(18);
  });

  it("keeps a future next-action date unchanged", () => {
    expect(forwardPastNextActionDate("2026-09-15", new Date(2026, 7, 9))).toBe("2026-09-15");
  });

  it("normalizes template next inspection dates before saving extracted fields", () => {
    const fields = normalizeExtractionFieldsForTemplate("תסקיר בדיקה", inspectionTemplate, {
      next_inspection_date: "2026-07-15",
    });

    expect(fields?.next_inspection_date).toBe(forwardPastNextActionDate("2026-07-15"));
  });

  it("normalizes template next inspection dates using the extracted inspection interval", () => {
    const fields = normalizeExtractionFieldsForTemplate("תסקיר בדיקה", inspectionTemplate, {
      start_date: "2025-02-17",
      next_inspection_date: "2025-08-16",
    });

    expect(fields?.next_inspection_date).toBe("2026-08-16");
    expect(fields?.inspection_interval_months).toBe(6);
    expect(fields?.date_diff_months).toBe(6);
  });

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

  it("removes address fields from normalized extraction output", () => {
    const fields = normalizeExtractionFieldsForTemplate("מספר תסקיר: 17924/484590", inspectionTemplate, {
      client_address: "רחוב 1",
      po_box: "123",
      client_zipcode: "7777777",
      client_company: "שי מגן",
    });

    expect(fields?.client_address).toBeUndefined();
    expect(fields?.po_box).toBeUndefined();
    expect(fields?.client_zipcode).toBeUndefined();
    expect(fields?.client_company).toBe("שי מגן");
  });

  it("keeps numeric suffixes in client company names", () => {
    const fields = normalizeExtractionFieldsForTemplate("פרטי הלקוח/תופש: מולטיפק פלסטיק 1990", inspectionTemplate, {
      client_company: "מולטיפק פלסטיק 1990",
    });

    expect(fields?.client_company).toBe("מולטיפק פלסטיק 1990");
  });

  it("adds spacing before numeric suffixes in client company names", () => {
    const fields = normalizeExtractionFieldsForTemplate("פרטי הלקוח/תופש: מולטיפק פלסטיק 1990", inspectionTemplate, {
      client_company: "מולטיפק פלסטיק1990",
    });

    expect(fields?.client_company).toBe("מולטיפק פלסטיק 1990");
  });

  it("restores numeric suffixes when OCR puts the number before the company name", () => {
    const fields = normalizeExtractionFieldsForTemplate("פרטי הלקוח/תופש: מולטיפק פלסטיק 1990", inspectionTemplate, {
      client_company: "1990מולטיפק פלסטיק",
    });

    expect(fields?.client_company).toBe("מולטיפק פלסטיק 1990");
  });

  it("fills contact_person from a normal Hebrew contact label", () => {
    const fields = normalizeExtractionFieldsForTemplate("איש קשר: קשוני", inspectionTemplate, {
      client_company: "מולטיפק פלסטיק 1990",
    });

    expect(fields?.contact_person).toBe("קשוני");
  });

  it("fills contact_person when the PDF text puts the value before the Hebrew label", () => {
    const fields = normalizeExtractionFieldsForTemplate("קשוני: איש קשר", inspectionTemplate, {
      client_company: "מולטיפק פלסטיק 1990",
    });

    expect(fields?.contact_person).toBe("קשוני");
  });

  it("fills contact_person when OCR merges it with the mobile phone label", () => {
    const fields = normalizeExtractionFieldsForTemplate("8575078-050: ניידאלון: איש קשר", inspectionTemplate, {
      client_company: "מ.הנסון בע\"מ",
    });

    expect(fields?.contact_person).toBe("אלון");
  });

  it("keeps an existing contact_person", () => {
    const fields = normalizeExtractionFieldsForTemplate("איש קשר: אלון", inspectionTemplate, {
      contact_person: "קשוני",
    });

    expect(fields?.contact_person).toBe("קשוני");
  });

  it("fills contact_email from the client details block", () => {
    const rawText = [
      "פרטי הלקוח/תופש: מ.הנסון בע\"מ",
      "איש קשר: אלון",
      "נייד: 050-8575078",
      "מייל: reymond.adir@hanson.biz",
      "תיאור מכונת הרמה",
    ].join("\n");
    const fields = normalizeExtractionFieldsForTemplate(rawText, inspectionTemplate, {
      client_company: "מ.הנסון בע\"מ",
    });

    expect(fields?.contact_email).toBe("reymond.adir@hanson.biz");
  });

  it("fills contact_email even when an older saved template lacks the email field", () => {
    const legacyTemplate = {
      ...inspectionTemplate,
      fields: inspectionTemplate.fields.filter((field) => field.key !== "contact_email"),
    };
    const fields = normalizeExtractionFieldsForTemplate("מייל: reymond.adir@hanson.biz", legacyTemplate, {
      client_company: "מ.הנסון בע\"מ",
    });

    expect(fields?.contact_email).toBe("reymond.adir@hanson.biz");
  });

  it("fills contact_email from a Hebrew table line fused to a reversed email", () => {
    const fields = normalizeExtractionFieldsForTemplate("תקופתית: סוג בדיקהcom.afar-d@Dafar:", inspectionTemplate, {
      client_company: "דפר עפר בע\"מ",
    });

    expect(fields?.contact_email).toBe("Dafar@d-afar.com");
    expect(fields?.client_email).toBe("Dafar@d-afar.com");
  });

  it("fills license_number from inspection text", () => {
    const fields = normalizeExtractionFieldsForTemplate("מספר רישוי: 201207", inspectionTemplate, {
      client_company: "מ.הנסון בע\"מ",
    });

    expect(fields?.license_number).toBe("201207");
  });

  it("fills a four-digit license_number", () => {
    const fields = normalizeExtractionFieldsForTemplate("מספר רישוי: 1234", inspectionTemplate, {
      client_company: "מ.הנסון בע\"מ",
    });

    expect(fields?.license_number).toBe("1234");
  });

  it("fills license_number when the PDF text puts the value before the Hebrew label", () => {
    const fields = normalizeExtractionFieldsForTemplate("201207 מספר רישוי:", inspectionTemplate, {
      client_company: "מ.הנסון בע\"מ",
    });

    expect(fields?.license_number).toBe("201207");
  });

  it("does not infer license_number from a nearby line without an explicit inline label", () => {
    const fields = normalizeExtractionFieldsForTemplate(["201207", "מספר רישוי:"].join("\n"), inspectionTemplate, {
      client_company: "מ.הנסון בע\"מ",
    });

    expect(fields?.license_number).toBeUndefined();
  });

  it("does not infer license_number from numeric tokens near mikud text", () => {
    const fields = normalizeExtractionFieldsForTemplate(["תאריך 15/07/2025 201207 מקוד", "מספר רישוי:"].join("\n"), inspectionTemplate, {
      client_company: "מ.הנסון בע\"מ",
    });

    expect(fields?.license_number).toBeUndefined();
  });

  it("does not infer license_number when mikud text sits between number and label", () => {
    const fields = normalizeExtractionFieldsForTemplate("201207 מקוד מספר רישוי:", inspectionTemplate, {
      client_company: "מ.הנסון בע\"מ",
    });

    expect(fields?.license_number).toBeUndefined();
  });

  it("does not infer license_number from a five-digit value under a mikud label", () => {
    const rawText = [
      "מאספת הזמנות חשמלית",
      ": פקס089427325: טלפון",
      ": מיקוד",
      "80200",
      ": מספר רישוי",
    ].join("\n");
    const fields = normalizeExtractionFieldsForTemplate(rawText, inspectionTemplate, {
      client_company: "מ.הנסון בע\"מ",
    });

    expect(fields?.license_number).toBeUndefined();
  });

  it("fills license_number from the standalone number after inspection location", () => {
    const rawText = [
      ": תיאור מכונת הרמה. 2",
      "תיאור",
      "מפעל הנסון, אשדוד: מקום הבדיקה",
      "201207",
      "גלגלי 6בעלת , מלגזה חשמלית",
    ].join("\n");
    const fields = normalizeExtractionFieldsForTemplate(rawText, inspectionTemplate, {
      client_company: "מ.הנסון בע\"מ",
    });

    expect(fields?.license_number).toBe("201207");
  });

  it("keeps an existing numeric license_number", () => {
    const fields = normalizeExtractionFieldsForTemplate("מספר רישוי: 201207", inspectionTemplate, {
      license_number: "999999",
    });

    expect(fields?.license_number).toBe("999999");
  });

  it("keeps an existing four-digit license_number", () => {
    const fields = normalizeExtractionFieldsForTemplate("מספר רישוי: 201207", inspectionTemplate, {
      license_number: "1234",
    });

    expect(fields?.license_number).toBe("1234");
  });

  it("replaces an existing non-numeric license_number with the numeric document value", () => {
    const fields = normalizeExtractionFieldsForTemplate("מספר רישוי: 201207", inspectionTemplate, {
      license_number: "custom-license",
    });

    expect(fields?.license_number).toBe("201207");
  });

  it("does not extract a non-numeric license_number", () => {
    const fields = normalizeExtractionFieldsForTemplate("מספר רישוי: ABC-123", inspectionTemplate, {
      client_company: "מ.הנסון בע\"מ",
    });

    expect(fields?.license_number).toBeUndefined();
  });

  it("does not extract a seven-digit postal-code-shaped value as license_number", () => {
    const fields = normalizeExtractionFieldsForTemplate("מספר רישוי: 1234567", inspectionTemplate, {
      client_company: "מ.הנסון בע\"מ",
    });

    expect(fields?.license_number).toBeUndefined();
  });

  it("separates the lifting-machine description from the checked equipment row", () => {
    const rawText = [
      "2. תיאור מכונת הרמה:",
      "ציוד שנבדק",
      "מלגזה חשמלית",
    ].join("\n");

    const fields = normalizeExtractionFieldsForTemplate(rawText, inspectionTemplate, {
      _equipment: [
        {
          name: "מלגזה חשמלית",
          manufacturer: "Linde",
          model: "E70-01",
          serial_number: "H21279L0006",
          load_capacity_work: ["7000 ק\"ג"],
          load_capacity_test: [],
          load_radius: [],
          category: "lift",
        },
      ] as any,
    });

    expect(fields?.equipment_description).toBe("מכונת הרמה");
    expect(fields?.checked_equipment).toBe("מלגזה חשמלית");
  });

  it("repairs equipment_description when AI copied the checked equipment item there", () => {
    const fields = normalizeExtractionFieldsForTemplate("תסקיר בדיקה תקופתית של מכונת הרמה", inspectionTemplate, {
      equipment_description: "מלגזה חשמלית",
      checked_equipment: "מלגזה חשמלית",
    });

    expect(fields?.equipment_description).toBe("מכונת הרמה");
    expect(fields?.checked_equipment).toBe("מלגזה חשמלית");
  });

  it("repairs a full label phrase into the equipment description value", () => {
    const fields = normalizeExtractionFieldsForTemplate("2. תיאור מכונת הרמה:", inspectionTemplate, {
      equipment_description: "תיאור מכונת הרמה",
    });

    expect(fields?.equipment_description).toBe("מכונת הרמה");
  });
});
