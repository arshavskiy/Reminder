import { describe, expect, it } from "vitest";
import { preferIsraeliDocumentDate } from "../pipeline/importer";

describe("preferIsraeliDocumentDate", () => {
  it("keeps the recent day.month.year when Hebrew text also reverses it", () => {
    const text = "תאריך עריכת החשבון: 26.09.08\n08.09.26 :החשבון עריכת תאריך";
    expect(preferIsraeliDocumentDate("2008-09-26", text)).toBe("2026-09-08");
  });

  it("leaves a recent stored date alone", () => {
    expect(preferIsraeliDocumentDate("2026-09-08", "08.09.26")).toBe("2026-09-08");
  });

  it("does not replace an old date with an unrelated date from the text", () => {
    expect(preferIsraeliDocumentDate("2023-12-17", "17.12.23\n01.01.24")).toBe("2023-12-17");
  });
});
