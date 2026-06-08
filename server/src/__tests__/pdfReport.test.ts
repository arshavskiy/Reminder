import {describe, expect, it} from "vitest";
import path from "path";
import fs from "fs";

// ── filename generation (mirrors route logic) ─────────────────────────────────

function buildFilename(name: string | null | undefined, serialOrId: string): string {
  const safeName = (name ?? "equipment")
    .replace(/[^\wא-ת\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  const safeSerial = serialOrId.replace(/[^\w-]/g, "");
  return `${safeName}_${safeSerial}.pdf`;
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("PDF Report — filename generation", () => {
  it("builds filename from equipment name and serial number", () => {
    expect(buildFilename("במת הרמה טלסקופית", "233-017")).toBe("במת_הרמה_טלסקופית_233-017.pdf");
  });

  it("strips special characters from name", () => {
    expect(buildFilename('עגורן (מנוף) א"מ', "SN-001")).toBe("עגורן_מנוף_אמ_SN-001.pdf");
  });

  it("falls back to 'equipment' when name is null", () => {
    expect(buildFilename(null, "SN-999")).toBe("equipment_SN-999.pdf");
  });

  it("strips slashes and dots from serial", () => {
    expect(buildFilename("מנוף", "17924/484590")).toBe("מנוף_17924484590.pdf");
  });
});

describe("PDF Report — font file exists", () => {
  it("NotoSansHebrew.ttf is present in scripts/", () => {
    const fontPath = path.resolve(process.cwd(), "../scripts/NotoSansHebrew.ttf");
    expect(fs.existsSync(fontPath)).toBe(true);
  });
});

describe("PDF Report — pdfkit generates a valid PDF buffer", async () => {
  it("produces a non-empty buffer starting with %PDF", async () => {
    const PDFDocument = (await import("pdfkit")).default;
    const fontPath = path.resolve(process.cwd(), "../scripts/NotoSansHebrew.ttf");

    const buffer: Buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      try {
        doc.registerFont("Hebrew", fontPath);
        doc.font("Hebrew").fontSize(12).text("דוח בדיקת ציוד", { align: "right" });
      } catch {
        doc.fontSize(12).text("Equipment Report");
      }
      doc.end();
    });

    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.slice(0, 4).toString()).toBe("%PDF");
  });

  it("produces a valid PDF even without a font file", async () => {
    const PDFDocument = (await import("pdfkit")).default;

    const buffer: Buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.fontSize(12).text("Equipment Report");
      doc.end();
    });

    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.slice(0, 4).toString()).toBe("%PDF");
  });
});

describe("PDF Report — history section logic", () => {
  function formatDaysStr(daysUntil: number | null): string {
    if (daysUntil === null) return "";
    if (daysUntil < 0) return ` (פג לפני ${Math.abs(daysUntil)} ימים)`;
    return ` (${daysUntil} ימים)`;
  }

  it("formats overdue days correctly", () => {
    expect(formatDaysStr(-15)).toBe(" (פג לפני 15 ימים)");
  });

  it("formats future days correctly", () => {
    expect(formatDaysStr(30)).toBe(" (30 ימים)");
  });

  it("returns empty string for null days", () => {
    expect(formatDaysStr(null)).toBe("");
  });
});
