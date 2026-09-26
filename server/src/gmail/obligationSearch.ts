// Gmail search packs for the obligations scan.
// English and Hebrew exist now. Another pack can be added later.
// A caller sends 1–3 of the packs (the language URL, or a user choice).
// The query uses only those packs, and it does not require an attachment.

import type { ObligationKind } from "./inlineObligationScan";

export const OBLIGATION_SEARCH_LANGS = ["en", "he"] as const;
export type ObligationSearchLang = (typeof OBLIGATION_SEARCH_LANGS)[number];

export const MIN_OBLIGATION_SEARCH_LANGS = 1;
export const MAX_OBLIGATION_SEARCH_LANGS = 3;

export interface ObligationSearchTerm {
  lang: ObligationSearchLang;
  kind: ObligationKind;
  text: string;
}

export const OBLIGATION_SEARCH_TERMS: Record<ObligationSearchLang, readonly ObligationSearchTerm[]> = {
  en: [
    { lang: "en", kind: "warranty", text: "warranty" },
    { lang: "en", kind: "warranty", text: "valid until" },
    { lang: "en", kind: "warranty", text: "expires" },
    { lang: "en", kind: "warranty", text: "expiry" },
    { lang: "en", kind: "payment_due", text: "payment due" },
    { lang: "en", kind: "payment_due", text: "due date" },
    { lang: "en", kind: "payment_due", text: "notice of debt" },
    { lang: "en", kind: "payment_due", text: "debt notice" },
    { lang: "en", kind: "payment_due", text: "debt payment" },
    { lang: "en", kind: "payment_due", text: "immediate demand" },
    { lang: "en", kind: "payment_due", text: "immediate payment" },
    { lang: "en", kind: "payment_due", text: "outstanding debt" },
    { lang: "en", kind: "payment_due", text: "payment demand" },
    { lang: "en", kind: "due_task", text: "pay immediately" },
    { lang: "en", kind: "due_task", text: "due immediately" },
    { lang: "en", kind: "renewal", text: "renewal" },
    { lang: "en", kind: "renewal", text: "subscription" },
    { lang: "en", kind: "maintenance", text: "next service" },
    { lang: "en", kind: "maintenance", text: "maintenance" },
  ],
  he: [
    { lang: "he", kind: "warranty", text: "אחריות" },
    { lang: "he", kind: "warranty", text: "בתוקף עד" },
    { lang: "he", kind: "warranty", text: "תפוגה" },
    { lang: "he", kind: "payment_due", text: "מועד תשלום" },
    { lang: "he", kind: "payment_due", text: "לתשלום עד" },
    { lang: "he", kind: "payment_due", text: "הודעה על חוב" },
    { lang: "he", kind: "payment_due", text: "תשלום חוב" },
    { lang: "he", kind: "payment_due", text: "דרישה מיידית" },
    { lang: "he", kind: "payment_due", text: "חוב בארנונה" },
    { lang: "he", kind: "due_task", text: "לתשלום מיידי" },
    { lang: "he", kind: "renewal", text: "חידוש" },
    { lang: "he", kind: "renewal", text: "מנוי" },
    { lang: "he", kind: "maintenance", text: "טיפול הבא" },
    { lang: "he", kind: "maintenance", text: "תאריך טיפול" },
  ],
};

export interface ObligationSearchParameters {
  langs: ObligationSearchLang[];
  historyMonths: number;
  terms: ObligationSearchTerm[];
  q: string;
}

export type ObligationLangError = "unsupported_obligation_lang" | "too_many_obligation_langs";

export function obligationLangErrorBody(error: ObligationLangError) {
  return {
    error,
    supported: [...OBLIGATION_SEARCH_LANGS],
    min: MIN_OBLIGATION_SEARCH_LANGS,
    max: MAX_OBLIGATION_SEARCH_LANGS,
  };
}

/** Absent means Hebrew, matching the rest of the API. Otherwise 1–3 known packs. */
export function parseObligationSearchLangs(value: unknown): ObligationSearchLang[] | ObligationLangError {
  if (value == null || value === "") return ["he"];
  const raw = Array.isArray(value) ? value.flatMap((item) => String(item).split(",")) : String(value).split(",");
  const requested = raw.map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!requested.length) return ["he"];

  const unique: string[] = [];
  for (const code of requested) {
    if (!unique.includes(code)) unique.push(code);
  }
  if (unique.length > MAX_OBLIGATION_SEARCH_LANGS) return "too_many_obligation_langs";

  const langs: ObligationSearchLang[] = [];
  for (const code of unique) {
    if (!isObligationSearchLang(code)) return "unsupported_obligation_lang";
    langs.push(code);
  }
  return langs;
}

export function obligationSearchParameters(
  langs: readonly ObligationSearchLang[],
  historyMonths: number,
): ObligationSearchParameters {
  const selected = langs.length ? [...langs] : (["he"] as ObligationSearchLang[]);
  const terms = selected.flatMap((lang) => [...OBLIGATION_SEARCH_TERMS[lang]]);
  return {
    langs: selected,
    historyMonths,
    terms,
    q: buildInlineObligationQuery(historyMonths, selected),
  };
}

export function buildInlineObligationQuery(
  historyMonths: number,
  langs: readonly ObligationSearchLang[] = ["he"],
): string {
  const selected = langs.length ? langs : (["he"] as ObligationSearchLang[]);
  const terms = selected
    .flatMap((lang) => OBLIGATION_SEARCH_TERMS[lang].map((term) => term.text))
    .map(formatGmailSearchTerm);
  const body = `{${terms.join(" ")}}`;
  if (!historyMonths || historyMonths < 1) return body;
  return `${body} newer_than:${historyMonths}m`;
}

export function isObligationSearchLang(value: string): value is ObligationSearchLang {
  return (OBLIGATION_SEARCH_LANGS as readonly string[]).includes(value);
}

function formatGmailSearchTerm(term: string): string {
  return `"${term.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}
