import {describe, expect, it} from "vitest";
import {extractFromOcr} from "../pipeline/ocrExtractor";

// ─── expiry_date ──────────────────────────────────────────────────────────────

describe("extractFromOcr — expiry_date", () => {
  it("extracts forward 'בתוקף עד' with DD/MM/YYYY", () => {
    const r = extractFromOcr("בתוקף עד: 15/01/2026");
    expect(r.expiry_date).toBe("2026-01-15");
  });

  it("extracts forward 'תאריך בדיקה הבאה' with DD.MM.YYYY", () => {
    const r = extractFromOcr("תאריך בדיקה הבאה: 20.06.2026");
    expect(r.expiry_date).toBe("2026-06-20");
  });

  it("extracts forward 'תוקף עד'", () => {
    const r = extractFromOcr("תוקף עד: 31/12/2025");
    expect(r.expiry_date).toBe("2025-12-31");
  });

  it("extracts forward 'מועד חידוש'", () => {
    const r = extractFromOcr("מועד חידוש: 01/03/2027");
    expect(r.expiry_date).toBe("2027-03-01");
  });

  it("extracts reversed bidi date before 'בתוקף עד'", () => {
    const r = extractFromOcr("2027/07/23: בתוקף עד");
    expect(r.expiry_date).toBe("2027-07-23");
  });

  it("extracts reversed bidi date before 'בדיקה הבאה'", () => {
    const r = extractFromOcr("2026/11/19: בדיקה הבאה");
    expect(r.expiry_date).toBe("2026-11-19");
  });

  it("returns null when no expiry label present", () => {
    const r = extractFromOcr("מסמך כללי\nאיש קשר: רחל לוי");
    expect(r.expiry_date).toBeNull();
  });
});

// ─── contact_name ─────────────────────────────────────────────────────────────

describe("extractFromOcr — contact_name", () => {
  it("extracts 'איש קשר' label", () => {
    const r = extractFromOcr("איש קשר: בר");
    expect(r.contact_name).toBe("בר");
  });

  it("extracts 'שם הלקוח' label", () => {
    const r = extractFromOcr("שם הלקוח: דוד כהן");
    expect(r.contact_name).toBe("דוד כהן");
  });

  it("extracts 'שם החברה' label", () => {
    const r = extractFromOcr("שם החברה: חברת ABC");
    expect(r.contact_name).toBe("חברת ABC");
  });

  it("extracts 'שם מעביד / בעל הציוד' label", () => {
    const r = extractFromOcr("שם מעביד / בעל הציוד: מילניום בע\"מ");
    expect(r.contact_name).toBe("מילניום בע\"מ");
  });

  it("extracts reversed bidi 'תופש/פרטי הלקוח' pattern", () => {
    const r = extractFromOcr("מילניום שירותים בע\"מ : תופש/פרטי הלקוח");
    expect(r.contact_name).toBe("מילניום שירותים בע\"מ");
  });

  it("rejects garbled bidi table header as contact_name", () => {
    const r = extractFromOcr("פקס: טלפוןתקופתית: סוג בדיקה679 : תופש/פרטי הלקוח");
    expect(r.contact_name).toBeNull();
  });

  it("rejects value containing 'מספר רישוי'", () => {
    const r = extractFromOcr("מספר רישויXYZ : תופש/פרטי הלקוח");
    expect(r.contact_name).toBeNull();
  });

  it("rejects value with no Hebrew letters", () => {
    const r = extractFromOcr("ABC123 : תופש/פרטי הלקוח");
    expect(r.contact_name).toBeNull();
  });
});

// ─── contact_phone ────────────────────────────────────────────────────────────

describe("extractFromOcr — contact_phone", () => {
  it("extracts labelled phone with dash", () => {
    const r = extractFromOcr("נייד: 053-8801490");
    expect(r.contact_phone).toBe("053-8801490");
  });

  it("normalises 10-digit phone without dash", () => {
    const r = extractFromOcr("נייד: 0537285690");
    expect(r.contact_phone).toBe("053-7285690");
  });

  it("extracts reversed bidi phone before 'נייד'", () => {
    const r = extractFromOcr("0522226569: נייד");
    expect(r.contact_phone).toBe("052-2226569");
  });

  it("falls back to bare mobile number", () => {
    const r = extractFromOcr("פרטים: 052-9991234");
    expect(r.contact_phone).toBe("052-9991234");
  });
});

// ─── contact_email ────────────────────────────────────────────────────────────

describe("extractFromOcr — contact_email", () => {
  it("extracts normal email", () => {
    const r = extractFromOcr("מייל: david@cohen.co.il");
    expect(r.contact_email).toBe("david@cohen.co.il");
  });

  it("corrects reversed bidi email with standard TLD", () => {
    const r = extractFromOcr("מייל: il.co.example@user");
    expect(r.contact_email).toBe("user@il.co.example");
  });

  it("corrects reversed bidi email with non-standard domain", () => {
    const r = extractFromOcr("מייל: il.co1945.shelev@klodin");
    expect(r.contact_email).toBe("klodin@il.co1945.shelev");
  });

  it("corrects Hebrew table text fused to a reversed email with hyphenated domain", () => {
    const r = extractFromOcr("תקופתית: סוג בדיקהcom.afar-d@Dafar:");
    expect(r.contact_email).toBe("Dafar@d-afar.com");
  });

  it("returns null when no email present", () => {
    const r = extractFromOcr("איש קשר: יוסי\nנייד: 050-1234567");
    expect(r.contact_email).toBeNull();
  });
});

// ─── client_address ───────────────────────────────────────────────────────────

describe("extractFromOcr — client_address", () => {
  it("extracts forward 'כתובת' label", () => {
    const r = extractFromOcr("כתובת: הקידמה 235, אשדוד");
    expect(r.client_address).toBe("הקידמה 235, אשדוד");
  });

  it("extracts forward 'רחוב' label", () => {
    const r = extractFromOcr("רחוב: הרצל 10, תל אביב");
    expect(r.client_address).toBe("הרצל 10, תל אביב");
  });

  it("extracts reversed bidi 'פרטים מלאים' line and strips phone", () => {
    const r = extractFromOcr("ב אשדוד טלפון36העצמאות רח: פרטים מלאים");
    expect(r.client_address).not.toContain("טלפון");
    expect(r.client_address).not.toBeNull();
  });
});

// ─── po_box ───────────────────────────────────────────────────────────────────

describe("extractFromOcr — po_box", () => {
  it("extracts forward 'ת.ד' with digits", () => {
    const r = extractFromOcr("ת.ד: 679");
    expect(r.po_box).toBe("679");
  });

  it("extracts reversed 'ת.ד' pattern", () => {
    const r = extractFromOcr("679: ת.ד");
    expect(r.po_box).toBe("679");
  });
});

// ─── document_type ────────────────────────────────────────────────────────────

describe("extractFromOcr — document_type", () => {
  it("identifies 'תסקיר בדיקה'", () => {
    expect(extractFromOcr("תסקיר ניסוי ובדיקה").document_type).toBe("תסקיר בדיקה");
  });

  it("identifies 'חוזה'", () => {
    expect(extractFromOcr("חוזה שירות").document_type).toBe("חוזה");
  });

  it("identifies 'חשבונית'", () => {
    expect(extractFromOcr("חשבונית מס").document_type).toBe("חשבונית");
  });

  it("returns null when no keyword found", () => {
    expect(extractFromOcr("מסמך כללי").document_type).toBeNull();
  });
});

// ─── full realistic snippet ───────────────────────────────────────────────────

describe("extractFromOcr — realistic inspection report snippet", () => {
  const TEXT = `
מספר תסקיר: 17924/484590
פרטי הלקוח / תופש
שם החברה: מילניום שירותים ולוגיסטיקה בע"מ
איש קשר: בר
נייד: 053-8801490
מייל: benitaliftingplat@gmail.com
כתובת: הקידמה 235, אשדוד
ת.ד: 679

תאריך בדיקה: 15/01/2025
בתוקף עד: 15/01/2026
  `;

  it("extracts all expected fields", () => {
    const r = extractFromOcr(TEXT);
    expect(r.expiry_date).toBe("2026-01-15");
    expect(r.contact_name).toBe("בר");
    expect(r.contact_phone).toBe("053-8801490");
    expect(r.contact_email).toBe("benitaliftingplat@gmail.com");
    expect(r.client_address).toBe("הקידמה 235, אשדוד");
    expect(r.po_box).toBe("679");
    expect(r.document_type).toBe("תסקיר בדיקה");
  });
});
