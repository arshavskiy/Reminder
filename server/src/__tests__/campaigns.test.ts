import {describe, expect, it} from "vitest";
import XLSX from "xlsx";
import {buildCampaignMessage, campaignSubject, chunk, htmlToText, parseLeadSheet, withUnsubscribeFooter} from "../outreach/campaigns";

const csv = (text: string) => Buffer.from(text, "utf8");

describe("campaign lead import", () => {
  it("maps English headers and normalizes emails", () => {
    const result = parseLeadSheet(csv("Name,Email,Company,Phone,City\nDana,Dana@Test.co.il,Acme,050-1,Haifa\nBad,not-an-email,,,\n"), "leads.csv");
    expect(result.rows).toEqual([{email: "dana@test.co.il", name: "Dana", company: "Acme", phone: "050-1", city: "Haifa"}]);
    expect(result.invalid).toBe(1);
    expect(result.totalRows).toBe(2);
  });

  it("maps Hebrew headers and a UTF-8 BOM", () => {
    const result = parseLeadSheet(csv("﻿שם,אימייל,טלפון\nיוסי,yossi@test.co.il,052-2\n"), "לידים.csv");
    expect(result.rows[0]).toMatchObject({email: "yossi@test.co.il", name: "יוסי", phone: "052-2"});
  });

  it("accepts a bare list of emails with no header row", () => {
    const result = parseLeadSheet(csv("a@test.co.il\nb@test.co.il\n"), "list.txt");
    expect(result.rows.map((r) => r.email)).toEqual(["a@test.co.il", "b@test.co.il"]);
  });

  it("reads xlsx files", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["Email", "Name"], ["x@test.co.il", "X"]]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Leads");
    const buffer = XLSX.write(book, {type: "buffer", bookType: "xlsx"}) as Buffer;
    expect(parseLeadSheet(buffer, "leads.xlsx").rows[0]).toMatchObject({email: "x@test.co.il", name: "X"});
  });
});

describe("campaign message", () => {
  it("marks the subject as advertising once", () => {
    expect(campaignSubject("ניהול מסמכים")).toBe("פרסומת: ניהול מסמכים");
    expect(campaignSubject("פרסומת: ניהול מסמכים")).toBe("פרסומת: ניהול מסמכים");
  });

  it("adds the opt-out footer only when missing", () => {
    const added = withUnsubscribeFooter("<html><body><p>שלום</p></body></html>");
    expect(added).toContain("לחצו כאן");
    expect(added.indexOf("לחצו כאן")).toBeLessThan(added.indexOf("</body>"));
    const existing = "<p>להסרה השיבו הסר</p>";
    expect(withUnsubscribeFooter(existing)).toBe(existing);
  });

  it("builds a text part and the List-Unsubscribe header", () => {
    const message = buildCampaignMessage({subject: "Hi", html: "<p>שלום <a href=\"https://remindocr.com\">כאן</a></p>"});
    expect(message.text).toContain("כאן (https://remindocr.com)");
    expect(message.headers["List-Unsubscribe"]).toContain("mailto:contact@remindocr.com");
    expect(htmlToText("<ul><li>א</li><li>ב</li></ul>")).toBe("• א\n• ב");
  });

  it("chunks recipients into batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
