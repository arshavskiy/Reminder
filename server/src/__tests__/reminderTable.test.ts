import {describe, expect, it} from "vitest";
import * as XLSX from "xlsx";
import {parseReminderTable} from "../imports/reminderTable";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const csv = (text: string) => parseReminderTable(Buffer.from(text), "test.csv");
describe("direct reminder table import", () => {
  it("parses the shipped workbook in the actual Node ESM server runtime", () => {
    const output = execFileSync(process.execPath, ["--import", "tsx/esm", "--input-type=module", "-e", `
      import {readFileSync} from 'node:fs';
      import {parseReminderTable} from './src/imports/reminderTable.ts';
      const result = parseReminderTable(readFileSync('../client/src/public/templates/remindocr-import-20.xlsx'), 'sample.xlsx');
      console.log(JSON.stringify({count: result.rows.length, errors: result.errors}));
    `], {cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8"});
    expect(JSON.parse(output)).toEqual({count: 20, errors: []});
  });
  it("reads English quoted CSV and calculates calendar days", () => {
    const p = csv('\uFEFFExpiry Name,Expiry Date,Description,Reminder Advance Days\r\nRenewal,2027-01-15,"Review, then renew",30;7;0');
    expect(p.errors).toEqual([]);
    expect(p.rows[0].dates).toEqual(["2026-12-16", "2027-01-08", "2027-01-15"]);
    expect(p.rows[0].fields.description).toBe("Review, then renew");
  });
  it("reads Hebrew headers and Unicode values", () => {
    const p = csv('שם תזכורת,תאריך תפוגה,שם לקוח,סוג לקוח,אימייל לקוח,טלפון\nבדיקת בטיחות,2027-08-20,חברת דוגמה,חברה,demo@example.com,0501234567');
    expect(p.errors).toEqual([]);
    expect(p.rows[0].fields.clientType).toBe("company");
    expect(p.rows[0].fields.phone).toBe("0501234567");
    expect(p.rows[0].recipients).toEqual(["demo@example.com"]);
  });
  it("rejects invalid dates, reversed dates, bad recipients and negative offsets", () => {
    for (const row of ["A,2027-02-29,,,", "A,2027-02-28,2027-03-01,,", "A,2027-02-28,,broken,", "A,2027-02-28,,,-1"]) {
      expect(csv(`Expiry Name,Expiry Date,Start Date,Reminder Recipients,Reminder Advance Days\n${row}`).errors).toHaveLength(1);
    }
  });
  it("rejects missing/duplicate headers and duplicate IDs", () => {
    expect(csv("Name\nA").errors.length).toBeGreaterThan(0);
    expect(csv("Name,שם תזכורת,Expiry Date\nA,A,2027-01-01").errors.length).toBeGreaterThan(0);
    expect(csv("Name,Expiry Date,External ID\nA,2027-01-01,1\nB,2027-02-01,1").errors).toHaveLength(1);
  });
  it("rejects conflicting repeated client details", () => {
    expect(csv("Name,Expiry Date,Client External ID,Client Name\nA,2027-01-01,C1,One\nB,2027-02-01,C1,Two").errors).toHaveLength(1);
  });
  it("warns about unknown fields and past triggers", () => {
    const p = csv("Name,Expiry Date,Unknown\nA,2020-01-01,test");
    expect(p.errors).toEqual([]);
    expect(p.warnings).toHaveLength(2);
  });
  it("reads numeric Excel dates in both date systems and rejects formulas", () => {
    for (const date1904 of [false, true]) {
      const wb = XLSX.utils.book_new();
      wb.Workbook = {WBProps: {date1904}};
      const ws = XLSX.utils.aoa_to_sheet([["שם תזכורת", "תאריך תפוגה"], ["בדיקה", date1904 ? 44926 : 46388]]);
      XLSX.utils.book_append_sheet(wb, ws, "עברית");
      const parse = () => parseReminderTable(XLSX.write(wb, {type: "buffer", bookType: "xlsx"}), "test.xlsx");
      expect(parse().rows[0].expiry).toBe("2027-01-01");
      ws.B2.f = "TODAY()";
      expect(parse().errors).toHaveLength(1);
    }
  });
  it("bounds rows and rejects other file types", () => {
    expect(() => csv("Name,Expiry Date\n" + Array.from({length: 501}, (_, i) => `${i},2027-01-01`).join("\n"))).toThrow();
    expect(() => parseReminderTable(Buffer.from("text"), "test.pdf")).toThrow();
  });
});
