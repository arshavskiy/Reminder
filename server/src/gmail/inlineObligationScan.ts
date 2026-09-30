// Reads an email together with attached document text and proposes one obligation.
// A dated proposal needs a closed kind, a named thing, and a future due date.
// "Pay immediately" is a due task: a warning, with the balance date as its reference.
// The caller keeps the message as the proof and does not write a reminder until the user accepts.

export const OBLIGATION_KINDS = ["warranty", "renewal", "payment_due", "maintenance", "due_task"] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

export const OBLIGATION_KIND_LABELS: Record<ObligationKind, string> = {
  warranty: "אחריות",
  renewal: "חידוש",
  payment_due: "מועד תשלום",
  maintenance: "טיפול הבא",
  due_task: "משימה דחופה",
};

export interface InlineObligationProposal {
  kind: ObligationKind;
  title: string;
  entity_name: string;
  due_date: string;
  evidence_quote: string;
  confidence: "high" | "medium";
  warning?: "immediate";
}

export interface InlineEmailScanInput {
  from: string;
  subject: string;
  plain: string | null;
  html: string | null;
  now?: Date;
  sentOn?: string;
}

const KIND_PATTERNS: { kind: ObligationKind; re: RegExp }[] = [
  { kind: "payment_due", re: /payment\s+due|amount\s+due|due\s+date|pay\s+by|pay\s+immediately|due\s+immediately|notice\s+of\s+debt|debt\s+notice|debt\s+payment|immediate\s+demand|immediate\s+payment|outstanding\s+debt|payment\s+demand|מועד\s*תשלום|תאריך\s*לתשלום|תאריך\s*פירעון|מועד\s*אחרון|לתשלום\s*עד|לתשלום\s*מיידי|עד\s*לתשלום|הודעה\s*על\s*חוב|תשלום\s*חוב|דרישה\s*מיידית|חוב\s*בארנונה|срок[а-яё]*\s+оплаты|срок[а-яё]*\s+платежа|оплатить\s+до|оплата\s+до|к\s+оплате|задолженност[а-яё]*|требовани[а-яё]*\s+об\s+оплате|оплатить\s+немедленно/gi },
  { kind: "warranty", re: /warranty|אחריות|гаранти[а-яё]*|действительн[а-яё]*\s+до|срок[а-яё]*\s+действия/gi },
  { kind: "renewal", re: /renewal|\brenew\b|subscription|מנוי|חידוש|продлени[а-яё]*|подписк[а-яё]*/gi },
  { kind: "maintenance", re: /maintenance|next\s+service|service\s+due|טיפול\s*הבא|תאריך\s*טיפול|טיפול\s*תקופתי|следующ[а-яё]*\s+обслуживани[а-яё]*|техническ[а-яё]*\s+обслуживани[а-яё]*/gi },
  // Action deadlines with no money attached, e.g. a consulate waiting list that
  // must be confirmed "в срок до <date>".
  { kind: "due_task", re: /в\s+срок\s+до|подтвердить\s+(?:необходимость|актуальность|заявк[а-яё]*)|актуальност[а-яё]*\s+заявки|списк[а-яё]*\s+ожидания/gi },
];

const DUE_CUE = /expires?|expir(?:y|ation)|valid\s+until|valid\s+through|warranty|payment\s+due|amount\s+due|due\s+date|due\s+on|pay\s+by|notice\s+of\s+debt|debt\s+notice|debt\s+payment|immediate\s+demand|immediate\s+payment|outstanding\s+debt|payment\s+demand|renew(?:al)?|\brenew\b|subscription|next\s+service|service\s+due|maintenance|בתוקף\s*עד|תפוג|פג\s*תוקף|מועד\s*תשלום|תאריך\s*לתשלום|תאריך\s*פירעון|מועד\s*אחרון|לתשלום|אחריות|חידוש|טיפול\s*הבא|תאריך\s*טיפול|מנוי|הודעה\s*על\s*חוב|תשלום\s*חוב|דרישה\s*מיידית|חוב|истека[а-яё]*|действительн[а-яё]*\s+до|срок[а-яё]*\s+(?:действия|оплаты|платежа)|оплатить\s+до|оплата\s+до|к\s+оплате|задолженност[а-яё]*|продлени[а-яё]*|подписк[а-яё]*|гаранти[а-яё]*|обслуживани[а-яё]*|в\s+срок\s+до/i;

const ISSUE_DATE = /נערכה\s*בתאריך|נכון\s*לתאריך|תאריך\s*(?:עריכה|הפקה|הנפקה|הדפסה)|issue\s+date|date\s+of\s+issue|invoice\s+date|document\s+date|as\s+of|дата\s+(?:выдачи|выставления|документа)|по\s+состоянию\s+на/i;

const DUE_PHRASE_BEFORE = /payment\s+due|due\s+date|pay\s+by|valid\s+until|לתשלום\s*עד|תאריך\s*לתשלום|מועד\s*תשלום|מועד\s*אחרון|תאריך\s*פירעון|בתוקף\s*עד|срок[а-яё]*\s+оплаты|оплатить\s+до|действительн[а-яё]*\s+до|в\s+срок\s+до/i;

const RECEIPT_SUBJECT = /(?:^|[^\p{L}])(?:קבלה|receipt|квитанци[а-яё]*|кассовый\s+чек)(?:[^\p{L}]|$)/iu;

const IMMEDIATE = /pay\s+immediately|due\s+immediately|due\s+upon\s+receipt|לתשלום\s*מיידי|תשלום\s*מיידי|מיד\s*עם\s*קבלת|דרישה\s*מיידית|оплатить\s+немедленно|немедленн[а-яё]*\s+оплат[а-яё]*|срочн[а-яё]*\s+оплат[а-яё]*/i;

const SUBJECT_KIND_WORDS = /warranty|expires?|expiry|expiration|valid\s+until|payment\s+due|amount\s+due|due\s+date|notice\s+of\s+debt|debt\s+notice|debt\s+payment|immediate\s+demand|immediate\s+payment|outstanding\s+debt|payment\s+demand|renewal|\brenew\b|subscription|maintenance|next\s+service|service\s+due|אחריות|תפוג\S*|בתוקף\s*עד|מועד\s*תשלום|לתשלום\s*עד|חידוש|טיפול\s*הבא|תאריך\s*טיפול|מנוי|הודעה\s*על\s*חוב|דרישה\s*מיידית|תשלום\s*חוב|חוב\s*בארנונה|гаранти[а-яё]*|истека[а-яё]*|действительн[а-яё]*\s+до|срок[а-яё]*\s+(?:действия|оплаты)|оплатить\s+до|задолженност[а-яё]*|продлени[а-яё]*|подписк[а-яё]*|обслуживани[а-яё]*|подтверждени[а-яё]*\s+актуальности/gi;

const GENERIC_SENDER = /no-?reply|donotreply|notifications?|mailer-daemon|newsletter|noreply/i;

const ENGLISH_MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const HEBREW_MONTHS: Record<string, number> = {
  ינואר: 1, פברואר: 2, מרץ: 3, אפריל: 4, מאי: 5, יוני: 6,
  יולי: 7, אוגוסט: 8, ספטמבר: 9, אוקטובר: 10, נובמבר: 11, דצמבר: 12,
};

const RUSSIAN_MONTHS: Record<string, number> = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};

const ENGLISH_MONTH = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const HEBREW_MONTH = Object.keys(HEBREW_MONTHS).join("|");
const RUSSIAN_MONTH = Object.keys(RUSSIAN_MONTHS).join("|");

export function htmlToPlainText(html: string): string {
  const withoutActive = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withBreaks = withoutActive
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(stripped)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1].length > 0))
    .join("\n")
    .trim();
}

export function scanInlineEmailForObligation(input: InlineEmailScanInput): InlineObligationProposal | null {
  const body = emailToPlainText(input.plain, input.html);
  const subject = unwrapSubject(input.subject);
  const text = [subject, body].filter(Boolean).join("\n");
  if (!text.trim()) return null;

  const today = todayIso(input.now ?? new Date());
  const lines = text.split("\n");
  const dates = findDates(text).filter((found) => found.iso >= today && !dateIsDocumentDate(text, found.index));
  const cued = dates.filter((found) => lineIsCued(lines, found.line));
  if (!cued.length) return immediateDueTask(input, text, lines, subject);

  let chosen = cued[0];
  let chosenDistance = kindDistance(text, chosen.index);
  for (const found of cued.slice(1)) {
    const distance = kindDistance(text, found.index);
    if (distance < chosenDistance || (distance === chosenDistance && found.iso > chosen.iso)) {
      chosen = found;
      chosenDistance = distance;
    }
  }
  if (!Number.isFinite(chosenDistance)) return null;

  const kind = kindOnLine(lines[chosen.line]) ?? nearestKind(text, chosen.index);
  if (!kind) return null;

  const entity = entityName(subject, input.from);
  if (!entity) return null;

  const evidence = evidenceQuote(lines, chosen.line);
  const sameLine = kindOnLine(lines[chosen.line]) === kind;
  return {
    kind,
    title: `${OBLIGATION_KIND_LABELS[kind]}: ${entity}`,
    entity_name: entity,
    due_date: chosen.iso,
    evidence_quote: evidence,
    confidence: sameLine ? "high" : "medium",
  };
}

function immediateDueTask(
  input: InlineEmailScanInput,
  text: string,
  lines: string[],
  subject: string,
): InlineObligationProposal | null {
  if (!IMMEDIATE.test(text) || !paymentKindIn(text)) return null;
  const entity = entityName(subject, input.from);
  if (!entity) return null;
  const lineIndex = lines.findIndex((line) => IMMEDIATE.test(line));
  const due = asOfDate(text) ?? input.sentOn ?? todayIso(input.now ?? new Date());
  return {
    kind: "due_task",
    title: `${OBLIGATION_KIND_LABELS.due_task}: ${entity}`,
    entity_name: entity,
    due_date: due,
    evidence_quote: lineIndex >= 0 ? evidenceQuote(lines, lineIndex) : text.slice(0, 240),
    confidence: "high",
    warning: "immediate",
  };
}

function paymentKindIn(text: string): boolean {
  const payment = KIND_PATTERNS.find((pattern) => pattern.kind === "payment_due");
  if (!payment) return false;
  payment.re.lastIndex = 0;
  return payment.re.test(text);
}

function asOfDate(text: string): string | null {
  const dates = findDates(text).filter((found) => {
    const before = text.slice(Math.max(0, found.index - 48), found.index);
    return /נכון\s*לתאריך|as\s+of/i.test(before);
  });
  if (!dates.length) return null;
  dates.sort((a, b) => b.iso.localeCompare(a.iso));
  return dates[0].iso;
}

/** A matching subject opens the attached PDF. A receipt subject does not. */
export function subjectRequestsAttachmentDate(subject: string): boolean {
  const cleaned = unwrapSubject(subject);
  if (!cleaned || RECEIPT_SUBJECT.test(cleaned)) return false;
  return kindOnLine(cleaned) != null;
}

export function isObligationKind(value: unknown): value is ObligationKind {
  return typeof value === "string" && (OBLIGATION_KINDS as readonly string[]).includes(value);
}

function emailToPlainText(plain: string | null, html: string | null): string {
  const plainText = String(plain ?? "").trim();
  const htmlText = html ? htmlToPlainText(html) : "";
  return htmlText.length > plainText.length ? htmlText : plainText;
}

function unwrapSubject(subject: string): string {
  let value = String(subject ?? "").replace(/\s+/g, " ").trim();
  let previous = "";
  while (value !== previous) {
    previous = value;
    value = value.replace(/^(re|fw|fwd)\s*:\s*/i, "").trim();
  }
  return value;
}

function entityName(subject: string, from: string): string | null {
  const fromSubject = entityFromSubject(subject);
  if (fromSubject) return fromSubject;
  const name = senderDisplayName(from);
  if (name.length < 2 || name.length > 80) return null;
  if (GENERIC_SENDER.test(name)) return null;
  return name;
}

function entityFromSubject(subject: string): string | null {
  const cleaned = unwrapSubject(subject);
  if (cleaned.length < 4 || cleaned.length > 140) return null;
  const residue = cleaned.replace(SUBJECT_KIND_WORDS, " ").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  if (residue.length < 2) return null;
  return cleaned;
}

function senderDisplayName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  const name = (match ? match[1] : from).trim();
  if (name.includes("@")) return "";
  return name.replace(/\s+/g, " ");
}

function dateIsDocumentDate(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 48), index);
  if (DUE_PHRASE_BEFORE.test(before)) return false;
  return ISSUE_DATE.test(before);
}

function lineIsCued(lines: string[], line: number): boolean {
  if (DUE_CUE.test(lines[line] ?? "")) return true;
  const previous = line > 0 ? lines[line - 1] ?? "" : "";
  return previous.length > 0 && DUE_CUE.test(previous);
}

function kindOnLine(line: string | undefined): ObligationKind | null {
  if (!line) return null;
  for (const pattern of KIND_PATTERNS) {
    pattern.re.lastIndex = 0;
    if (pattern.re.test(line)) return pattern.kind;
  }
  return null;
}

function nearestKind(text: string, index: number): ObligationKind | null {
  let best: { kind: ObligationKind; distance: number } | null = null;
  for (const pattern of KIND_PATTERNS) {
    pattern.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.re.exec(text))) {
      const distance = Math.abs(match.index - index);
      if (!best || distance < best.distance) best = { kind: pattern.kind, distance };
    }
  }
  return best?.kind ?? null;
}

function kindDistance(text: string, index: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const pattern of KIND_PATTERNS) {
    pattern.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.re.exec(text))) {
      best = Math.min(best, Math.abs(match.index - index));
    }
  }
  return best;
}

function evidenceQuote(lines: string[], line: number): string {
  const current = (lines[line] ?? "").trim();
  const previous = line > 0 ? (lines[line - 1] ?? "").trim() : "";
  const quote = current.length < 8 && previous ? `${previous} ${current}` : current;
  return quote.slice(0, 240);
}

interface FoundDate {
  iso: string;
  index: number;
  line: number;
}

function findDates(text: string): FoundDate[] {
  const found: FoundDate[] = [];
  const patterns: RegExp[] = [
    /\b(20\d{2})-(\d{2})-(\d{2})\b/g,
    new RegExp(`\\b(\\d{1,2})[./](\\d{1,2})[./](20\\d{2})\\b`, "g"),
    new RegExp(`\\b(\\d{1,2})\\s+(${ENGLISH_MONTH})\\s+(20\\d{2})\\b`, "gi"),
    new RegExp(`\\b(${ENGLISH_MONTH})\\s+(\\d{1,2}),?\\s+(20\\d{2})\\b`, "gi"),
    new RegExp(`(\\d{1,2})\\s+ב?(${HEBREW_MONTH})\\s+(20\\d{2})`, "g"),
    new RegExp(`(\\d{1,2})\\s+(${RUSSIAN_MONTH})\\s+(20\\d{2})`, "gi"),
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const iso = isoFromMatch(match);
      if (!iso) continue;
      const line = text.slice(0, match.index).split("\n").length - 1;
      found.push({ iso, index: match.index, line });
    }
  }
  return found;
}

function isoFromMatch(match: RegExpExecArray): string | null {
  const raw = match[0];
  if (/^20\d{2}-\d{2}-\d{2}$/.test(raw)) {
    return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  if (/^\d{1,2}[./]\d{1,2}[./]20\d{2}$/.test(raw)) {
    return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  }
  const hebrew = Object.keys(HEBREW_MONTHS).find((month) => raw.includes(month));
  if (hebrew) return isoDate(Number(match[3]), HEBREW_MONTHS[hebrew], Number(match[1]));
  const russian = Object.keys(RUSSIAN_MONTHS).find((month) => raw.toLowerCase().includes(month));
  if (russian) return isoDate(Number(match[3]), RUSSIAN_MONTHS[russian], Number(match[1]));
  const monthName = raw.match(new RegExp(ENGLISH_MONTH, "i"))?.[0]?.toLowerCase();
  if (!monthName || !ENGLISH_MONTHS[monthName]) return null;
  const day = /^\d/.test(raw) ? Number(match[1]) : Number(match[2]);
  const year = Number(match[3]);
  return isoDate(year, ENGLISH_MONTHS[monthName], day);
}

function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const n = Number.parseInt(code, 16);
      return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : "";
    });
}
