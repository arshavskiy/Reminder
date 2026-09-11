import {describe, expect, it} from "vitest";
import {isLiftingAccessoryInspection, parseEquipmentFromPlumberTables, shouldSkipEquipmentInspection} from "../pipeline/equipmentTableParse";

describe("parseEquipmentFromPlumberTables", () => {
  it("reads a column-aligned equipment table and merges load sub-rows", () => {
    const tables = [[
      [
        ["תיאור", "יצרן", "דגם", "מס' סידורי", "רדיוס", "עומס מבחן", "עומס עבודה בטוח"],
        ["מנוף טעינה עצמי", "Fassi", "F365RA", "3602-0141", "3.5", "2500", "9250"],
        ["", "", "", "", "4.75", "", "8445"],
        ["", "", "", "", "6.6", "", "4340"],
      ],
    ]];

    const rows = parseEquipmentFromPlumberTables(tables);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "מנוף טעינה עצמי",
      manufacturer: "Fassi",
      model: "F365RA",
      serial_number: "3602-0141",
      category: "lift",
    });
    expect(rows[0].load_radius).toEqual(["3.5", "4.75", "6.6"]);
    expect(rows[0].load_capacity_work).toEqual(["9250", "8445", "4340"]);
    expect(rows[0].load_capacity_test).toEqual(["2500"]);
  });

  it("recovers visually reversed Hebrew headers", () => {
    const tables = [[
      [
        ["רואית", "ןרצי", "םגד", "ירודיס 'סמ", "סוידר", "ןחבמ סמוע", "חוטב הדובע סמוע"],
        ["מלגזה", "HIAB", "228 E-4", "2764", "2.8", "1000", "12000"],
      ],
    ]];
    const rows = parseEquipmentFromPlumberTables(tables);
    expect(rows[0].manufacturer).toBe("HIAB");
    expect(rows[0].model).toBe("228 E-4");
    expect(rows[0].serial_number).toBe("2764");
    expect(rows[0].load_capacity_work).toEqual(["12000"]);
  });

  it("reads a multi-item jack table with a merged visual-test cell", () => {
    const tables = [[
      [
        ["תיאור", "יצרן", "דגם", "מס' סידורי", "רדיוס עומס (מטר)", "עומס מבחן (ק\"ג)", "עומס עבודה בטוח (ק\"ג)"],
        ["מגבהה ידנית", "Compac", "", "9188", "", "בדיקה ויזואלית", "20000"],
        ["מגבהה ידנית", "", "", "9122", "", "", "40000"],
        ["מגבה הידראולי עמוד להרמת רכבים", "", "", "9844", "", "", "50000"],
      ],
    ]];

    const rows = parseEquipmentFromPlumberTables(tables);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      name: "מגבהה ידנית",
      manufacturer: "Compac",
      serial_number: "9188",
      category: "lift",
    });
    expect(rows[0].load_capacity_work).toEqual(["20000"]);
    expect(rows[0].load_capacity_test).toEqual([]);
    expect(rows[1]).toMatchObject({
      name: "מגבהה ידנית",
      manufacturer: "Compac",
      serial_number: "9122",
    });
    expect(rows[1].load_capacity_work).toEqual(["40000"]);
    expect(rows[2]).toMatchObject({
      name: "מגבה הידראולי עמוד להרמת רכבים",
      manufacturer: null,
      serial_number: "9844",
    });
    expect(rows[2].load_capacity_work).toEqual(["50000"]);
  });

  it("strips Hebrew leaked into the serial cell", () => {
    const tables = [[
      [
        ["תיאור", "יצרן", "דגם", "מס' סידורי", "רדיוס", "עומס מבחן", "עומס עבודה בטוח"],
        ["סל הרמת אדם בעזרת מלגזה", "", "", "6 הדמע", "", "בדיקה ויזואלית", "350 ק\"ג- 2 אנשים + ציוד"],
      ],
    ]];
    const rows = parseEquipmentFromPlumberTables(tables);
    expect(rows).toHaveLength(1);
    expect(rows[0].serial_number).toBe("6");
    expect(rows[0].load_capacity_work).toEqual(['350 ק"ג- 2 אנשים + ציוד']);
  });

  it("keeps a row with serial 6 and a text work-load, even if manufacturer is empty", () => {
    const tables = [[
      [
        ["תיאור", "יצרן", "דגם", "מס' סידורי", "רדיוס עומס (מטר)", "עומס מבחן (ק\"ג)", "עומס עבודה בטוח (ק\"ג)"],
        ["סל הרמה אנכי להתקנה", "", "", "6", "", "בדיקה ויזואלית", "350 ק\"ג + 2 אנשים"],
      ],
    ]];
    const rows = parseEquipmentFromPlumberTables(tables);
    expect(rows).toHaveLength(1);
    expect(rows[0].serial_number).toBe("6");
    expect(rows[0].load_capacity_work).toEqual(['350 ק"ג + 2 אנשים']);
  });

  it("does not create equipment from a description-only table row", () => {
    const tables = [[
      [
        ["תיאור", "יצרן", "דגם", "מס' סידורי", "רדיוס", "עומס מבחן", "עומס עבודה בטוח"],
        ["סל הרמה אנכי להתקנה על דפנות, פלטפורמה 1.1X1.1", "", "", "", "", "בדיקה ויזואלית", ""],
      ],
    ]];
    expect(parseEquipmentFromPlumberTables(tables)).toEqual([]);
  });
});

describe("isLiftingAccessoryInspection", () => {
  it("matches accessory report titles", () => {
    expect(isLiftingAccessoryInspection("תסקיר 16569 אביזרי הרמה.pdf")).toBe(true);
    expect(isLiftingAccessoryInspection("חברת חשמל אביזרים inv 580064.pdf")).toBe(true);
    expect(isLiftingAccessoryInspection("תסקיר מנוף טעינה עצמי FASSI.pdf")).toBe(false);
  });

  it("skips סל הרמה reports", () => {
    expect(shouldSkipEquipmentInspection("סל הרמה מכללת לבטח מבוא חורון תסקיר 18939.pdf")).toBe(true);
    expect(shouldSkipEquipmentInspection("תסקיר 17997 סל הרמה ארז גולן.pdf")).toBe(true);
    expect(shouldSkipEquipmentInspection("תסקיר מנוף טעינה עצמי FASSI.pdf")).toBe(false);
  });
});
