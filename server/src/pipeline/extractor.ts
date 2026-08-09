import OpenAI from "openai";
import {mkdirSync, writeFileSync} from "fs";
import {join} from "path";
import {getDataDir, getSettings} from "../settings";
import type {DocTemplate, DynamicExtraction, ExtractionResult} from "../../src/shared/types.js";
import {buildPromptForTemplate, InspectorProfile} from "../templates/buildPrompt";
import {logger} from "../logger";

const SYSTEM_PROMPT = `You are a document intelligence assistant specializing in Hebrew business, legal, and technical documents (contracts, invoices, inspection reports / תסקירים, certificates, etc.).
Extract structured information from the provided document text and return ONLY valid JSON matching the schema below.

CRITICAL RULES:
1. Dates: normalize ALL dates to ISO 8601 (YYYY-MM-DD). Hebrew calendar → convert to Gregorian. Israeli format DD/MM/YYYY → YYYY-MM-DD.
2. expiry_date represents the NEXT ACTION DATE — the date the user must be reminded about. Map these Hebrew terms to expiry_date:
   - "תאריך בדיקה הבא" / "בדיקה הבאה" / "מועד חידוש" (next inspection / next test / renewal date) — for inspection reports (תסקירים) and certificates
   - "תאריך פקיעה" / "תוקף עד" / "בתוקף עד" (expiry / valid until) — for contracts, certificates, insurance
   - "מועד תשלום" / "תאריך לתשלום" (payment due date) — for invoices
   Always pick THE FUTURE DATE the user needs to act on, NOT the issue date.
3. start_date = the date the document was issued / inspection was performed / contract started.
4. Client identity — extract BOTH fields when both are present:
   - client_company: the BUSINESS/COMPANY name (e.g. "מילניום שירותים ולוגיסטיקה בע\\"מ"). Look near "פרטי הלקוח" / "שם החברה" / "תופש".
   - client_name: the CONTACT PERSON (e.g. "שילה"). Look near "איש קשר".
5. document_type: classify in Hebrew (e.g. "תסקיר בדיקה", "חוזה", "חשבונית", "אישור", "תעודה").
6. document_number: the report/document/invoice number (e.g. "תסקיר מספר 15935" → "15935"). Distinct from contract_number.
7. Phone numbers: keep original Israeli format (e.g. "050-7870067"). If the number appears as 10 consecutive digits with no dash (e.g. "0537285690"), insert the dash after the 3rd digit → "053-7285690".
8. Email addresses: Hebrew PDFs sometimes output email addresses in reversed visual order, e.g. "il.co1945.shelev@klodin" which is actually "klodin@shelev1945.co.il". Recognize a reversed email by checking whether the part after "@" looks like a name/word and the part before "@" looks like a domain (contains dots and a TLD like .co.il / .com / .org). If reversed, swap the two parts around "@".
9. The text may have been extracted from a Hebrew PDF; some words can be mis-spaced or have residual bidi artifacts. Use context to determine the correct meaning.
10. IMPORTANT — company names with embedded numbers: Hebrew PDFs sometimes output company names in reversed visual order with digits concatenated without spaces, e.g. "מ\"הובלות בע1945שלב" which is actually "שלב 1945 הובלות בע\"מ". Reconstruct the correct name using context clues such as email domain, address, or other mentions.
11. If a field cannot be determined, use null. Do not add extra fields. Do not invent data.

JSON schema:
{
  "client_name": string | null,
  "client_company": string | null,
  "client_id": string | null,
  "client_email": string | null,
  "client_phone": string | null,
  "client_address": string | null,
  "document_type": string | null,
  "document_number": string | null,
  "contract_number": string | null,
  "contract_type": string | null,
  "start_date": "YYYY-MM-DD" | null,
  "expiry_date": "YYYY-MM-DD" | null,
  "amount": number | null,
  "currency": string | null,
  "parties": string[],
  "tasks": [{"description": string, "due_date": "YYYY-MM-DD" | null}],
  "summary_hebrew": string | null,
  "confidence": "high" | "medium" | "low"
}`;

function buildClient(settings: ReturnType<typeof getSettings>) {

  if (settings.aiBackend === "ollama") {
    return new OpenAI({
      baseURL: `${settings.ollamaUrl}/v1`,
      apiKey: "ollama",
    });
  }
  return new OpenAI({ apiKey: settings.openAiKey });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterMs(err: unknown): number | null {
  const anyErr = err as any;
  const headers = anyErr?.headers;
  const retryAfterMs = headers?.["retry-after-ms"] ?? headers?.get?.("retry-after-ms");
  const retryAfterSeconds = headers?.["retry-after"] ?? headers?.get?.("retry-after");
  const retryAfterMsNumber = Number(retryAfterMs);
  if (Number.isFinite(retryAfterMsNumber) && retryAfterMsNumber > 0) return Math.ceil(retryAfterMsNumber);
  const retryAfterSecondsNumber = Number(retryAfterSeconds);
  if (Number.isFinite(retryAfterSecondsNumber) && retryAfterSecondsNumber > 0) return Math.ceil(retryAfterSecondsNumber * 1000);

  const message = err instanceof Error ? err.message : String(err);
  const msMatch = message.match(/try again in\s+(\d+)\s*ms/i);
  if (msMatch) return Number(msMatch[1]);
  const secMatch = message.match(/try again in\s+([\d.]+)\s*s/i);
  if (secMatch) return Math.ceil(Number(secMatch[1]) * 1000);
  return null;
}

function isRateLimitError(err: unknown): boolean {
  const anyErr = err as any;
  const message = err instanceof Error ? err.message : String(err);
  return anyErr?.status === 429 || anyErr?.code === "rate_limit_exceeded" || /429|rate limit/i.test(message);
}

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}

async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  meta: { documentId?: string | number; model: string; backend: string; scope: string }
): Promise<T> {
  const maxAttempts = readIntEnv("AI_RATE_LIMIT_MAX_ATTEMPTS", 5, 1, 10);
  const baseWaitMs = readIntEnv("AI_RATE_LIMIT_BASE_WAIT_MS", 750, 100, 5_000);
  const minWaitMs = readIntEnv("AI_RATE_LIMIT_MIN_WAIT_MS", 500, 0, 10_000);
  const maxWaitMs = readIntEnv("AI_RATE_LIMIT_MAX_WAIT_MS", 10_000, 500, 20_000);
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err) || attempt === maxAttempts) break;

      const retryAfter = getRetryAfterMs(err);
      const fallback = baseWaitMs * Math.pow(2, attempt - 1);
      const waitMs = Math.min(Math.max(retryAfter ?? fallback, minWaitMs), maxWaitMs);
      logger.warn("ai_extraction_rate_limited_retry", {
        document_id: meta.documentId ?? null,
        backend: meta.backend,
        model: meta.model,
        scope: meta.scope,
        attempt,
        wait_ms: waitMs,
      });
      await sleep(waitMs);
    }
  }

  throw lastErr;
}

function logExtractorSettings(
  scope: "extractor" | "extractor:tpl",
  settings: ReturnType<typeof getSettings>,
  model: string,
  rawTextLength: number,
  inputTextLength: number,
  documentId?: string | number
) {
  const config = {
    backend: settings.aiBackend,
    model,
    extractionMaxChars: settings.extractionMaxChars,
    rawTextChars: rawTextLength,
    inputTextChars: inputTextLength,
    truncated: rawTextLength > inputTextLength,
    openAiKeyConfigured: Boolean(settings.openAiKey),
    ollamaUrl: settings.aiBackend === "ollama" ? settings.ollamaUrl : undefined,
  };

  logger.debug("extraction_settings", { scope, document_id: documentId ?? null, ...config });
}

export interface ExtractionRun {
  result: ExtractionResult | null;
  rawJson: string;
  model: string;
  backend: string;
  execMs: number;
  error: string | null;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}

export interface TemplateExtractionRun {
  template: DocTemplate;
  fields: DynamicExtraction | null;     // the flat extracted object
  rawJson: string;
  model: string;
  backend: string;
  execMs: number;
  error: string | null;
  usage: ExtractionRun["usage"];
}

export async function extractDocument(
  rawText: string,
  documentId?: string | number,
  fileName?: string
): Promise<ExtractionRun> {
  const settings = getSettings();
  const model = settings.aiBackend === "ollama" ? settings.ollamaModel : settings.openAiModel;
  const backend = settings.aiBackend;
  const text = rawText.slice(0, settings.extractionMaxChars);
  logExtractorSettings("extractor", settings, model, rawText.length, text.length, documentId);

  const t0 = Date.now();
  let rawJson = "";
  let error: string | null = null;
  let result: ExtractionResult | null = null;
  let usage: ExtractionRun["usage"] = null;

  try {
    const client = buildClient(settings);
    const response = await withRateLimitRetry(
      () => client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Document text:\n\n${text}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      { documentId, model, backend, scope: "extractor" }
    );

    rawJson = response.choices[0]?.message?.content ?? "";
    result = JSON.parse(rawJson) as ExtractionResult;
    if (response.usage) {
      usage = {
        prompt_tokens: response.usage.prompt_tokens ?? 0,
        completion_tokens: response.usage.completion_tokens ?? 0,
        total_tokens: response.usage.total_tokens ?? 0,
      };
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const execMs = Date.now() - t0;
  const run: ExtractionRun = { result, rawJson, model, backend, execMs, error, usage };

  if (error) {
    logger.error("ai_extraction_failed", {
      document_id: documentId ?? null,
      backend,
      model,
      exec_ms: execMs,
      error,
    });
  } else {
    logger.info("ai_extraction_completed", {
      document_id: documentId ?? null,
      backend,
      model,
      exec_ms: execMs,
      usage,
      parsed_ok: Boolean(result),
    });
  }

  // ── Dump full run to disk ───────────────────────────────────────────────────
  try {
    const dir = join(getDataDir(), "extractions");
    mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = (fileName ?? "doc").replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 80);
    const fileBase = `${ts}_doc${documentId ?? "X"}_${safeName}`;
    const dump = {
      timestamp: new Date().toISOString(),
      document_id: documentId ?? null,
      file_name: fileName ?? null,
      backend,
      model,
      exec_ms: execMs,
      usage,
      error,
      input_text_chars: text.length,
      input_text: text,
      result,
      raw_json: rawJson,
    };
    writeFileSync(join(dir, `${fileBase}.json`), JSON.stringify(dump, null, 2), "utf-8");
  } catch (writeErr) {
    logger.warn("ai_extraction_dump_failed", { document_id: documentId ?? null, error: writeErr });
  }

  return run;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template-driven extraction (dynamic fields from user-defined templates)
// ─────────────────────────────────────────────────────────────────────────────

export async function extractWithTemplate(
  rawText: string,
  template: DocTemplate,
  documentId?: string | number,
  fileName?: string,
  inspector?: InspectorProfile,
  prebuiltSystemPrompt?: string
): Promise<TemplateExtractionRun> {
  const settings = getSettings();
  const model = settings.aiBackend === "ollama" ? settings.ollamaModel : settings.openAiModel;
  const backend = settings.aiBackend;
  const text = rawText.slice(0, settings.extractionMaxChars);
  logExtractorSettings("extractor:tpl", settings, model, rawText.length, text.length, documentId);
  const systemPrompt = prebuiltSystemPrompt ?? buildPromptForTemplate(template, inspector);

  const t0 = Date.now();
  let rawJson = "";
  let error: string | null = null;
  let fields: DynamicExtraction | null = null;
  let usage: ExtractionRun["usage"] = null;

  try {
    const client = buildClient(settings);
    const response = await withRateLimitRetry(
      () => client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Document text:\n\n${text}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      { documentId, model, backend, scope: "extractor:tpl" }
    );
    rawJson = response.choices[0]?.message?.content ?? "";
    fields = JSON.parse(rawJson) as DynamicExtraction;
    if (response.usage) {
      usage = {
        prompt_tokens: response.usage.prompt_tokens ?? 0,
        completion_tokens: response.usage.completion_tokens ?? 0,
        total_tokens: response.usage.total_tokens ?? 0,
      };
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const execMs = Date.now() - t0;

  // Logging
  if (error) {
    logger.error("template_ai_extraction_failed", {
      document_id: documentId ?? null,
      template_name: template.name,
      backend,
      model,
      exec_ms: execMs,
      error,
    });
  } else {
    logger.info("template_ai_extraction_completed", {
      document_id: documentId ?? null,
      template_name: template.name,
      backend,
      model,
      exec_ms: execMs,
      usage,
      parsed_ok: Boolean(fields),
    });
  }

  // Disk dump for audit
  try {
    const dir = join(getDataDir(), "extractions");
    mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = (fileName ?? "doc").replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 80);
    writeFileSync(
      join(dir, `${ts}_doc${documentId ?? "X"}_${safeName}__tpl.json`),
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          document_id: documentId ?? null,
          file_name: fileName ?? null,
          template: { id: template.id, name: template.name },
          backend, model, exec_ms: execMs, usage, error,
          input_text_chars: text.length,
          input_text: text,
          fields,
          raw_json: rawJson,
        },
        null, 2
      ),
      "utf-8"
    );
  } catch (writeErr) {
    logger.warn("template_ai_extraction_dump_failed", { document_id: documentId ?? null, template_name: template.name, error: writeErr });
  }

  return { template, fields, rawJson, model, backend, execMs, error, usage };
}
