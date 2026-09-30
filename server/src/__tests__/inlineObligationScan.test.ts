import { describe, expect, it } from "vitest";
import { scanInlineEmailForObligation, subjectRequestsAttachmentDate } from "../gmail/inlineObligationScan";
import {
  MAX_OBLIGATION_SEARCH_LANGS,
  buildInlineObligationQuery,
  obligationSearchParameters,
  parseObligationSearchLangs,
} from "../gmail/obligationSearch";

const NOW = new Date("2026-09-26T00:00:00Z");

describe("obligation search languages", () => {
  it("builds a Hebrew query with no attachment requirement", () => {
    const query = buildInlineObligationQuery(3, ["he"]);
    expect(query).not.toMatch(/\bhas:attachment\b/);
    expect(query).toContain("אחריות");
    expect(query).toContain("הודעה על חוב");
    expect(query).toContain("תשלום חוב");
    expect(query).toContain("דרישה מיידית");
    expect(query).toContain("חוב בארנונה");
    expect(query).not.toContain("warranty");
    expect(query).toContain("newer_than:3m");
  });

  it("builds an English query from the English pack only", () => {
    const params = obligationSearchParameters(["en"], 3);
    expect(params.langs).toEqual(["en"]);
    expect(params.terms.every((term) => term.lang === "en")).toBe(true);
    expect(params.q).toContain("warranty");
    expect(params.q).toContain("notice of debt");
    expect(params.q).toContain("debt payment");
    expect(params.q).toContain("immediate demand");
    expect(params.q).toContain("outstanding debt");
    expect(params.q).not.toContain("אחריות");
  });

  it("unions two chosen packs and drops duplicates", () => {
    expect(parseObligationSearchLangs("en,he,en")).toEqual(["en", "he"]);
    const query = buildInlineObligationQuery(3, ["en", "he"]);
    expect(query).toContain("warranty");
    expect(query).toContain("אחריות");
  });

  it("defaults an empty choice to Hebrew", () => {
    expect(parseObligationSearchLangs(undefined)).toEqual(["he"]);
    expect(parseObligationSearchLangs("")).toEqual(["he"]);
  });

  it("rejects an unknown language and more than three languages", () => {
    expect(parseObligationSearchLangs("fr")).toBe("unsupported_obligation_lang");
    expect(parseObligationSearchLangs("en,he,fr")).toBe("unsupported_obligation_lang");
    expect(parseObligationSearchLangs("en,he,fr,de")).toBe("too_many_obligation_langs");
    expect(MAX_OBLIGATION_SEARCH_LANGS).toBe(3);
    expect(parseObligationSearchLangs("en,he,en")).toEqual(["en", "he"]);
  });
});

it("builds a Russian query from the Russian pack only", () => {
  const params = obligationSearchParameters(["ru"], 3);
  expect(params.langs).toEqual(["ru"]);
  expect(params.terms.every((term) => term.lang === "ru")).toBe(true);
  expect(params.q).toContain("срок оплаты");
  expect(params.q).toContain("список ожидания");
  expect(params.q).not.toContain("warranty");
  expect(parseObligationSearchLangs("ru,en,he")).toEqual(["ru", "en", "he"]);
});

describe("Russian obligation emails", () => {
  it("proposes a due task for a consulate waiting-list confirmation", () => {
    const result = scanInlineEmailForObligation({
      from: "queue-robot@kd-mid.ru",
      subject: "Подтверждение актуальности заявки",
      plain: "Вы зарегистрированы в списке ожидания По вопросу: Биометрический паспорт\nНомер заявки - 678182\n"
        + "просим в срок до 2026-08-26 подтвердить необходимость в совершении выбранного Вами консульского действия, пройдя по ссылке:",
      html: null,
      now: new Date("2026-08-18T00:00:00Z"),
    });
    expect(result).toMatchObject({ kind: "due_task", due_date: "2026-08-26", entity_name: "Подтверждение актуальности заявки" });
  });

  it("reads a Russian long-form payment date", () => {
    const result = scanInlineEmailForObligation({
      from: "Водоканал <billing@example.ru>",
      subject: "Счёт: срок оплаты",
      plain: "Оплатить до 5 октября 2026 г.",
      html: null,
      now: NOW,
    });
    expect(result).toMatchObject({ kind: "payment_due", due_date: "2026-10-05" });
  });
});

describe("scanInlineEmailForObligation", () => {
  it("reads a warranty date from the email body when there is no file", () => {
    const result = scanInlineEmailForObligation({
      from: "Bosch Service <service@bosch.example>",
      subject: "Warranty for Bosch Serie 6",
      plain: "Your warranty is valid until 15/03/2027.\nThank you for buying a washer.",
      html: null,
      now: NOW,
    });
    expect(result).toMatchObject({
      kind: "warranty",
      entity_name: "Warranty for Bosch Serie 6",
      due_date: "2027-03-15",
      confidence: "high",
    });
    expect(result?.evidence_quote).toContain("15/03/2027");
  });

  it("reads a payment due date out of an HTML table", () => {
    const result = scanInlineEmailForObligation({
      from: "City Water <billing@water.example>",
      subject: "Water bill — account 4412",
      plain: null,
      html: "<table><tr><td>Payment due</td><td>01/11/2026</td></tr></table>",
      now: NOW,
    });
    expect(result).toMatchObject({
      kind: "payment_due",
      entity_name: "Water bill — account 4412",
      due_date: "2026-11-01",
    });
  });

  it("reads the next service date from the body even when a label photo is also attached", () => {
    const result = scanInlineEmailForObligation({
      from: "Building <office@example.com>",
      subject: "Dishwasher service",
      plain: "The Bosch dishwasher next service is due on 12 October 2026.\nThe label photo is attached.",
      html: null,
      now: NOW,
    });
    expect(result).toMatchObject({
      kind: "maintenance",
      due_date: "2026-10-12",
      entity_name: "Dishwasher service",
    });
  });

  it("reads an English debt notice as a payment due", () => {
    const result = scanInlineEmailForObligation({
      from: "Collections <billing@example.com>",
      subject: "Notice of debt – immediate demand for debt payment",
      plain: "This is an immediate demand to settle the outstanding debt by 15/03/2027.",
      html: null,
      now: NOW,
    });
    expect(result).toMatchObject({
      kind: "payment_due",
      due_date: "2027-03-15",
      entity_name: "Notice of debt – immediate demand for debt payment",
      confidence: "high",
    });
  });

  it("reads a Hebrew arnona debt notice as a payment due", () => {
    const result = scanInlineEmailForObligation({
      from: "עירייה <noreply@example.co.il>",
      subject: "הודעה על חוב בארנונה – דרישה מיידית לתשלום חוב",
      plain: "דרישה מיידית לתשלום החוב עד 15/03/2027.",
      html: null,
      now: NOW,
    });
    expect(result).toMatchObject({
      kind: "payment_due",
      due_date: "2027-03-15",
      entity_name: "הודעה על חוב בארנונה – דרישה מיידית לתשלום חוב",
      confidence: "high",
    });
  });

  it("keeps a Hebrew warranty whose date is written with a month name", () => {
    const result = scanInlineEmailForObligation({
      from: "שירות <service@example.co.il>",
      subject: "אחריות למכונת כביסה בוש",
      plain: "האחריות בתוקף עד 15 במרץ 2027.",
      html: null,
      now: NOW,
    });
    expect(result).toMatchObject({
      kind: "warranty",
      due_date: "2027-03-15",
      entity_name: "אחריות למכונת כביסה בוש",
    });
  });

  it("drops a school notice that has a date and no obligation kind", () => {
    expect(scanInlineEmailForObligation({
      from: "School <office@school.example>",
      subject: "Field trip",
      plain: "The field trip is on 12/10/2026. Please sign the form.",
      html: null,
      now: NOW,
    })).toBeNull();
  });

  it("drops a date that has already passed", () => {
    expect(scanInlineEmailForObligation({
      from: "Bosch <service@bosch.example>",
      subject: "Warranty for Bosch Serie 6",
      plain: "Warranty valid until 01/01/2024.",
      html: null,
      now: NOW,
    })).toBeNull();
  });

  it("does not treat an American numeric date as day-first", () => {
    expect(scanInlineEmailForObligation({
      from: "Bosch <service@bosch.example>",
      subject: "Warranty for Bosch Serie 6",
      plain: "Warranty valid until 03/15/2027.",
      html: null,
      now: NOW,
    })).toBeNull();
  });

  it("reads the payment date from PDF text and skips the document date", () => {
    const result = scanInlineEmailForObligation({
      from: "עירייה <noreply@example.co.il>",
      subject: "הודעה על חוב בארנונה – דרישה מיידית לתשלום חוב",
      plain: "ההתראה נערכה בתאריך 01/11/2026.\nתאריך לתשלום 15/03/2027.",
      html: null,
      now: NOW,
    });
    expect(result).toMatchObject({
      kind: "payment_due",
      due_date: "2027-03-15",
    });
  });

  it("does not treat a balance-as-of date as a payment due", () => {
    expect(scanInlineEmailForObligation({
      from: "עירייה <noreply@example.co.il>",
      subject: "הודעה על חוב בארנונה - דרישת לתשלום",
      plain: "קיים חוב, נכון לתאריך 01/11/2026.",
      html: null,
      now: NOW,
    })).toBeNull();
  });

  it("does not treat the document date as the due date", () => {
    expect(scanInlineEmailForObligation({
      from: "עירייה <noreply@example.co.il>",
      subject: "הודעה על חוב בארנונה - דרישת לתשלום",
      plain: "ההתראה נערכה בתאריך 01/11/2026.",
      html: null,
      now: NOW,
    })).toBeNull();
  });

  it("warns with a due task when the email and the attached text say pay immediately", () => {
    const result = scanInlineEmailForObligation({
      from: "עירייה <noreply@example.co.il>",
      subject: "הודעה על חוב בארנונה - דרישת לתשלום",
      plain: [
        "שלום, בבדיקה נמצא כי יש לך חוב בגין ארנונה. לתשלום החוב.",
        "לתשלום מיידי",
        "ש\"ח, נכון לתאריך",
        "26.10.2024",
      ].join("\n"),
      html: null,
      now: NOW,
    });
    expect(result).toMatchObject({
      kind: "due_task",
      due_date: "2024-10-26",
      warning: "immediate",
      entity_name: "הודעה על חוב בארנונה - דרישת לתשלום",
    });
  });

  it("keeps a future pay-by date when the same text also says pay immediately", () => {
    const result = scanInlineEmailForObligation({
      from: "עירייה <noreply@example.co.il>",
      subject: "הודעה על חוב בארנונה - דרישת לתשלום",
      plain: "לתשלום מיידי\nתאריך לתשלום 15/03/2027.",
      html: null,
      now: NOW,
    });
    expect(result).toMatchObject({
      kind: "payment_due",
      due_date: "2027-03-15",
    });
    expect(result?.warning).toBeUndefined();
  });

  it("opens a PDF for a debt subject and skips a receipt subject", () => {
    expect(subjectRequestsAttachmentDate("הודעה על חוב בארנונה – דרישה מיידית לתשלום חוב")).toBe(true);
    expect(subjectRequestsAttachmentDate("Fwd: הודעה על חוב בארנונה - דרישת לתשלום")).toBe(true);
    expect(subjectRequestsAttachmentDate("קבלה מעיריית תל אביב יפו")).toBe(false);
    expect(subjectRequestsAttachmentDate("Receipt from the city")).toBe(false);
  });

  it("drops mail that names a kind but has no due date", () => {
    expect(scanInlineEmailForObligation({
      from: "News <news@example.com>",
      subject: "Renew your plan",
      plain: "Renewal is available any time.",
      html: null,
      now: NOW,
    })).toBeNull();
  });
});
