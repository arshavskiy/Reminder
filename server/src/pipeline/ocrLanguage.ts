import { col } from "../db/db";
import { getSettings } from "../settings";

/**
 * OCR language selection. Scanned documents are read with the Tesseract language packs
 * the user asked for; Hebrew and English are always the base, Russian is added for
 * accounts that receive Russian invoices and receipts. More packs make OCR slower and
 * can lower accuracy, so the list is limited to the supported ones.
 */
export const SUPPORTED_OCR_LANGUAGES = ["heb", "eng", "rus"] as const;
export type OcrLanguageCode = (typeof SUPPORTED_OCR_LANGUAGES)[number];

/** Order is fixed (heb, eng, rus) so equal sets always produce the same string. */
export function normalizeOcrLanguage(value: unknown, fallback: string | null = null): string | null {
  const parts = String(value ?? "")
    .toLowerCase()
    .split(/[+,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.some((part) => !(SUPPORTED_OCR_LANGUAGES as readonly string[]).includes(part))) return fallback;
  const wanted = new Set(parts);
  return SUPPORTED_OCR_LANGUAGES.filter((code) => wanted.has(code)).join("+");
}

/** The user's own setting when valid, else the server default (OCR_LANGUAGE, "heb+eng"). */
export async function ocrLanguageForUser(userId: string | undefined | null): Promise<string> {
  const globalDefault = normalizeOcrLanguage(getSettings().ocrLanguage, "heb+eng") ?? "heb+eng";
  if (!userId) return globalDefault;
  try {
    const row = await col<any>("user_settings").findOne({ user_id: String(userId) } as any, { projection: { ocr_language: 1 } } as any);
    return normalizeOcrLanguage(row?.ocr_language, globalDefault) ?? globalDefault;
  } catch {
    return globalDefault;
  }
}
