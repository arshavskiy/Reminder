import {describe, expect, it} from "vitest";
import {fixHebrewBidi, fixHebrewBidiTable} from "../pipeline/hebrewBidi";
import {tablesToText} from "../pipeline/pdfPlumberParser";

describe("fixHebrewBidiTable", () => {
  it("reverses visually stored equipment headers that fixHebrewBidi skips", () => {
    const table = [
      ["רואית", "ןרצי", "םגד", "ירודיס 'סמ", "סוידר", "ןחבמ סמוע", "חוטב הדובע סמוע"],
      ["מלגזה", "Fassi", "1000", "SN-12", "3.3", "15000", "11830"],
    ];

    // A single short header is below the document-level threshold.
    expect(fixHebrewBidi("ןרצי")).toBe("ןרצי");

    const fixed = fixHebrewBidiTable(table);
    expect(fixed[0][1]).toBe("יצרן");
    expect(fixed[0][2]).toBe("דגם");
    expect(fixed[0][5]).toBe("עומס מבחן");
    expect(fixed[1]).toEqual(table[1]);
  });

  it("leaves already-logical Hebrew tables alone", () => {
    const table = [
      ["תיאור", "יצרן", "דגם"],
      ["מלגזה", "Fassi", "1000"],
    ];
    expect(fixHebrewBidiTable(table)).toEqual(table);
  });
});

describe("tablesToText", () => {
  it("emits tab-separated rows with load/radius values intact", () => {
    const tables = [[
      [
        ["ןרצי", "סוידר", "ןחבמ סמוע"],
        ["Fassi", "3.3", "15000"],
        ["Fassi", "4.3", "11830"],
      ],
    ]];

    const text = tablesToText(tables);
    expect(text).toContain("יצרן\tסוידר\tעומס מבחן");
    expect(text).toContain("Fassi\t3.3\t15000");
    expect(text).toContain("Fassi\t4.3\t11830");
  });
});
