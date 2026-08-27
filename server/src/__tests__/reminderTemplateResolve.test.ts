import {describe, expect, it} from "vitest";
import {resolveReminderTemplateSource} from "../reminders/reminderTemplateResolve.js";
import {renderTemplate} from "../templates/renderEmail.js";
import {loadReminderTemplate} from "../email-templates/loader.js";

describe("resolveReminderTemplateSource", () => {
  it("prefers the reminder's own template id", () => {
    expect(resolveReminderTemplateSource({
      reminderTemplateId: "rem-1",
      userDefaultTemplateId: "user-1",
      docBoundTemplateId: "doc-1",
      globalDefaultTemplateId: "global-1",
    })).toEqual({ templateId: "rem-1", source: "reminder" });
  });

  it("falls back to the user default before doc-bound / global", () => {
    expect(resolveReminderTemplateSource({
      reminderTemplateId: null,
      userDefaultTemplateId: "user-1",
      docBoundTemplateId: "doc-1",
      globalDefaultTemplateId: "global-1",
    })).toEqual({ templateId: "user-1", source: "user_default" });
  });

  it("uses doc-bound then global default", () => {
    expect(resolveReminderTemplateSource({
      reminderTemplateId: "",
      userDefaultTemplateId: null,
      docBoundTemplateId: "doc-1",
      globalDefaultTemplateId: "global-1",
    })).toEqual({ templateId: "doc-1", source: "doc_bound" });

    expect(resolveReminderTemplateSource({
      reminderTemplateId: null,
      userDefaultTemplateId: null,
      docBoundTemplateId: null,
      globalDefaultTemplateId: "global-1",
    })).toEqual({ templateId: "global-1", source: "global_default" });
  });
});

describe("reminder template data fill", () => {
  it("fills the inspection template with reminder business vars", () => {
    const html = loadReminderTemplate("inspection");
    const vars = {
      client_company: "חברת בדיקה בע\"מ",
      contact_person: "ישראל ישראלי",
      contact_phone: "050-1234567",
      equipment_type: "מלגזה",
      expiry_date: "2026-09-01",
      advance_days: 14,
      engineer_name: "מהנדס ראשי",
      inspector_number: "484590",
      from_name: "RemindOCR",
    };
    const out = renderTemplate(html, vars, { escape: false });
    expect(out).toContain("חברת בדיקה");
    expect(out).toContain("ישראל ישראלי");
    expect(out).toContain("050-1234567");
    expect(out).toContain("מלגזה");
    expect(out).toContain("2026-09-01");
    expect(out).toContain("14 ימים");
  });

  it("fills subject lines with the same vars", () => {
    const subject = "[תזכורת בדיקה] {{client_company}} — {{advance_days}} ימים לבדיקה";
    expect(renderTemplate(subject, {
      client_company: "Acme Ltd",
      advance_days: 30,
    }, { escape: false })).toBe("[תזכורת בדיקה] Acme Ltd — 30 ימים לבדיקה");
  });
});
