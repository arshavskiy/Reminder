import {fixHebrewBidiTable} from "./hebrewBidi";

export type EquipmentTableRow = {
  name: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  load_capacity_work: string[];
  load_capacity_test: string[];
  load_radius: string[];
  category: string;
};

type ColKey = "name" | "manufacturer" | "model" | "serial" | "radius" | "test" | "work";

const HEADER_MATCHERS: Array<{key: ColKey; test: (cell: string) => boolean}> = [
  {key: "work", test: (c) => /עומס\s*עבודה|עבודה\s*בטוח|בטוח|הדובע|חוטב/.test(c) && !/מבחן|ןחבמ/.test(c)},
  {key: "test", test: (c) => /מבחן|ןחבמ/.test(c)},
  {key: "radius", test: (c) => /רדיוס|סוידר/.test(c)},
  {key: "serial", test: (c) => /סידורי|סריאלי|ירודיס/.test(c)},
  {key: "manufacturer", test: (c) => /יצרן|ןרצי/.test(c)},
  {key: "model", test: (c) => /דגם|םגד/.test(c)},
  {key: "name", test: (c) => /תיאור|רואית|ראית/.test(c)},
];

function normalizeCell(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function headerMap(row: string[]): Partial<Record<ColKey, number>> {
  const map: Partial<Record<ColKey, number>> = {};
  row.forEach((raw, index) => {
    const cell = normalizeCell(raw);
    for (const matcher of HEADER_MATCHERS) {
      if (map[matcher.key] != null) continue;
      if (matcher.test(cell)) map[matcher.key] = index;
    }
  });
  return map;
}

function headerScore(map: Partial<Record<ColKey, number>>): number {
  return Object.keys(map).length;
}

function isMostlyNumeric(value: string): boolean {
  const compact = value.replace(/[,\s]/g, "");
  return /^\d+(?:\.\d+)?$/.test(compact);
}

function looksLikeSerial(value: string): boolean {
  const compact = value.replace(/[\s-]/g, "");
  return /^\d{6,}$/.test(compact) || /^[A-Z0-9-]{6,}$/i.test(compact) && /\d/.test(compact) && /[A-Z]/i.test(compact);
}

/** Keep digit/latin serials. If Hebrew leaked into the cell (e.g. "6 הדמע"), keep the number only. */
function cleanSerial(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/[֐-׿]/.test(trimmed)) return trimmed;
  const digits = trimmed.match(/\d{1,8}/);
  return digits?.[0] ?? null;
}

function looksLikeManufacturer(value: string): boolean {
  return /^(Fassi|HIAB|Palfinger|Versalift|Effer|PM|Manitou|JLG|Genie|Daf|MAN|Volvo|Mercedes|Iveco|Compac)$/i.test(value.trim());
}

function cellAt(row: string[], index: number | undefined): string {
  if (index == null || index < 0 || index >= row.length) return "";
  return normalizeCell(row[index] ?? "");
}

function guessCategory(name: string): string {
  if (/מנוף|מלגזה|עגורן|מגבה|במת\s*הרמה|סל/.test(name)) return "lift";
  if (/רצועה|שאקל|אביזר/.test(name)) return "accessory";
  return "other";
}

function pushUnique(list: string[], value: string) {
  if (!value || list.includes(value)) return;
  list.push(value);
}

function emptyRow(): EquipmentTableRow {
  return {
    name: "",
    manufacturer: null,
    model: null,
    serial_number: null,
    load_capacity_work: [],
    load_capacity_test: [],
    load_radius: [],
    category: "other",
  };
}

function isIdentityRow(row: EquipmentTableRow): boolean {
  return Boolean(row.manufacturer || row.model || row.serial_number || row.name);
}

function isLoadValue(value: string): boolean {
  if (isMostlyNumeric(value)) return true;
  return /\d/.test(value) && /ק\s*"?\s*ג|kg|אנשים/i.test(value);
}

/** Accessory inspection reports should not create equipment records. */
export function isLiftingAccessoryInspection(...parts: Array<string | null | undefined>): boolean {
  const hay = parts.map((part) => String(part ?? "")).join(" ");
  return /אביזר(?:י)?\s*הרמה|אבזר(?:י)?ם|אביזרים/.test(hay);
}

/** Basket-lift / accessory reports: do not create equipment records. */
export function shouldSkipEquipmentInspection(...parts: Array<string | null | undefined>): boolean {
  const hay = parts.map((part) => String(part ?? "")).join(" ");
  return isLiftingAccessoryInspection(hay) || /סל\s*הרמ/.test(hay);
}

/** Skip description-only / empty-identity rows. Do not invent equipment from a blob. */
export function isUsableEquipmentRow(row: EquipmentTableRow): boolean {
  const serial = row.serial_number?.trim() ?? "";
  const manufacturer = row.manufacturer?.trim() ?? "";
  const name = row.name?.trim() ?? "";
  if (!manufacturer) return false;
  if (!name && !serial) return false;
  if (serial && !/\d/.test(serial)) return false;
  if (name.length > 220) return false;
  return true;
}

/**
 * Turn pdfplumber tables into equipment rows. Continuation rows that only
 * carry load/radius values are merged onto the previous item.
 */
export function parseEquipmentFromPlumberTables(tables: string[][][][]): EquipmentTableRow[] {
  let best: {table: string[][]; map: Partial<Record<ColKey, number>>; headerIndex: number; score: number} | null = null;

  for (const page of tables) {
    for (const rawTable of page) {
      const table = fixHebrewBidiTable(rawTable).map((row) => row.map(normalizeCell));
      for (let i = 0; i < table.length; i++) {
        const map = headerMap(table[i]);
        const score = headerScore(map);
        if (score >= 3 && (!best || score > best.score)) {
          best = {table, map, headerIndex: i, score};
        }
      }
    }
  }

  if (!best) return [];

  const {table, map, headerIndex} = best;
  const items: EquipmentTableRow[] = [];
  let current: EquipmentTableRow | null = null;

  for (const row of table.slice(headerIndex + 1)) {
    if (!row.some(Boolean)) continue;
    if (headerScore(headerMap(row)) >= 3) continue;

    const next = emptyRow();
    next.name = cellAt(row, map.name);
    next.manufacturer = cellAt(row, map.manufacturer) || null;
    next.model = cellAt(row, map.model) || null;
    const serial = cleanSerial(cellAt(row, map.serial));
    next.serial_number = serial;
    const work = cellAt(row, map.work);
    const test = cellAt(row, map.test);
    const radius = cellAt(row, map.radius);
    if (work && isLoadValue(work)) pushUnique(next.load_capacity_work, work.replace(/,/g, ""));
    if (test && isMostlyNumeric(test)) pushUnique(next.load_capacity_test, test.replace(/,/g, ""));
    if (radius && isMostlyNumeric(radius)) pushUnique(next.load_radius, radius);

    // Cells sometimes shift when plumber splits a wrapped description.
    if (!next.manufacturer) {
      const latin = row.find((cell) => looksLikeManufacturer(cell));
      if (latin) next.manufacturer = latin;
    }
    if (!next.serial_number) {
      const serialCell = row.find((cell) => looksLikeSerial(cell));
      if (serialCell) next.serial_number = serialCell.replace(/\s+/g, "");
    }

    if (isIdentityRow(next)) {
      if (!next.manufacturer && current?.manufacturer && next.name && next.name === current.name) {
        next.manufacturer = current.manufacturer;
      }
      if (!next.model && current?.model && next.name && next.name === current.name) {
        next.model = current.model;
      }
      next.category = guessCategory(next.name);
      items.push(next);
      current = next;
    } else if (current) {
      for (const value of next.load_capacity_work) pushUnique(current.load_capacity_work, value);
      for (const value of next.load_capacity_test) pushUnique(current.load_capacity_test, value);
      for (const value of next.load_radius) pushUnique(current.load_radius, value);
      if (next.name && next.name.length > current.name.length) current.name = next.name;
    }
  }

  return items.filter(isUsableEquipmentRow);
}

export function flattenEquipmentFields(rows: EquipmentTableRow[]) {
  const first = rows[0];
  if (!first) return {};
  return {
    manufacturer: first.manufacturer,
    model: first.model,
    serial_number: first.serial_number,
    load_capacity: first.load_capacity_work.join(" / ") || null,
    _equipment: rows,
  };
}
