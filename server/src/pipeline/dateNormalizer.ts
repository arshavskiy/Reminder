import { HDate, months } from "@hebcal/core";

// Matches patterns like כ״ה בתשרי תשפ״ה or ה' אב תשפ"ד
const HEBREW_DATE_PATTERN =
  /(\d{1,2}|[א-ת][״׳]?[א-ת]?)\s+ב?(ניסן|אייר|סיון|תמוז|אב|אלול|תשרי|חשון|כסלו|טבת|שבט|אדר[א-ת]?)\s+(ת[שרק][פסעמנ][א-ת]?)/g;

const HEBREW_MONTHS: Record<string, number> = {
  ניסן: months.NISAN,
  אייר: months.IYYAR,
  סיון: months.SIVAN,
  תמוז: months.TAMUZ,
  אב: months.AV,
  אלול: months.ELUL,
  תשרי: months.TISHREI,
  חשון: months.CHESHVAN,
  כסלו: months.KISLEV,
  טבת: months.TEVET,
  שבט: months.SHVAT,
  אדר: months.ADAR_I,
  אדרא: months.ADAR_I,
  אדרב: months.ADAR_II,
};

function hebrewGematria(str: string): number {
  const VALUES: Record<string, number> = {
    א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
    י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90,
    ק: 100, ר: 200, ש: 300, ת: 400,
  };
  let total = 0;
  for (const ch of str.replace(/[״׳"']/g, "")) {
    total += VALUES[ch] ?? 0;
  }
  return total;
}

// Attempt to parse a Hebrew year string like תשפ״ה → 5785
function parseHebrewYear(str: string): number {
  const base = hebrewGematria(str);
  // Years like תשפ״ה = 5785; if <5000 add 5000
  return base < 5000 ? base + 5000 : base;
}

// Attempt to parse a Hebrew day string like כ״ה → 25
function parseHebrewDay(str: string): number {
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  return hebrewGematria(str);
}

export function normalizeHebrewDate(raw: string): string | null {
  try {
    const match = HEBREW_DATE_PATTERN.exec(raw);
    if (!match) return null;
    const [, dayStr, monthStr, yearStr] = match;
    const day = parseHebrewDay(dayStr);
    const month = HEBREW_MONTHS[monthStr];
    const year = parseHebrewYear(yearStr);
    if (!month || !day || !year) return null;
    const hd = new HDate(day, month, year);
    const greg = hd.greg();
    return greg.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// Normalize a date string that might be Gregorian (DD/MM/YYYY or YYYY-MM-DD) or Hebrew
export function normalizeDate(raw: string): string | null {
  if (!raw) return null;

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // DD/MM/YYYY or DD.MM.YYYY
  const dmy = raw.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Try Hebrew
  return normalizeHebrewDate(raw);
}
