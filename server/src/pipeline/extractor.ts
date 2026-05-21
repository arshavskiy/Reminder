import OpenAI from "openai";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getSettings, getDataDir } from "../settings";
import type { ExtractionResult, DocTemplate, DynamicExtraction } from "../../src/shared/types.js";
import { buildPromptForTemplate } from "../templates/buildPrompt";

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
7. Phone numbers: keep original Israeli format (e.g. "050-7870067").
8. The text may have been extracted from a Hebrew PDF; some words can be mis-spaced or have residual bidi artifacts. Use context to determine the correct meaning.
9. If a field cannot be determined, use null. Do not add extra fields. Do not invent data.

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
  documentId?: number,
  fileName?: string
): Promise<ExtractionRun> {
  const settings = getSettings();
  const model = settings.aiBackend === "ollama" ? settings.ollamaModel : settings.openAiModel;
  const backend = settings.aiBackend;
  const text = rawText.slice(0, settings.extractionMaxChars);

  const t0 = Date.now();
  let rawJson = "";
  let error: string | null = null;
  let result: ExtractionResult | null = null;
  let usage: ExtractionRun["usage"] = null;

  try {
    const client = buildClient(settings);
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Document text:\n\n${text}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

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

  // ── Console log ─────────────────────────────────────────────────────────────
  if (error) {
    console.error(
      `[extractor] ❌ doc=${documentId ?? "?"} backend=${backend} model=${model} time=${execMs}ms — ${error}`
    );
  } else {
    const u = usage
      ? `tokens: prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} total=${usage.total_tokens}`
      : "tokens: n/a";
    console.log(
      `[extractor] ✓ doc=${documentId ?? "?"} backend=${backend} model=${model} time=${execMs}ms — ${u}`
    );
    if (result) {
      console.log('[extractor] →', result);
    }
  }

  // ── Dump full run to disk ───────────────────────────────────────────────────
  try {
    const dir = join(getDataDir(), "extractions");
    mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = (fileName ?? "doc").replace(/[^a-zA-Z0-9א-ת._-]/g, "_").slice(0, 80);
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
      input_text_preview: text.slice(0, 500),
      result,
      raw_json: rawJson,
    };
    writeFileSync(join(dir, `${fileBase}.json`), JSON.stringify(dump, null, 2), "utf-8");
  } catch (writeErr) {
    console.warn(`[extractor] Failed to write extraction dump: ${writeErr}`);
  }

  return run;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template-driven extraction (dynamic fields from user-defined templates)
// ─────────────────────────────────────────────────────────────────────────────

export async function extractWithTemplate(
  rawText: string,
  template: DocTemplate,
  documentId?: number,
  fileName?: string
): Promise<TemplateExtractionRun> {
  const settings = getSettings();
  const model = settings.aiBackend === "ollama" ? settings.ollamaModel : settings.openAiModel;
  const backend = settings.aiBackend;
  const text = rawText.slice(0, settings.extractionMaxChars);
  const systemPrompt = buildPromptForTemplate(template);

  const t0 = Date.now();
  let rawJson = "";
  let error: string | null = null;
  let fields: DynamicExtraction | null = null;
  let usage: ExtractionRun["usage"] = null;

  try {
    const client = buildClient(settings);
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Document text:\n\n${text}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });
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
    console.error(
      `[extractor:tpl] ❌ doc=${documentId ?? "?"} tpl="${template.name}" time=${execMs}ms — ${error}`
    );
  } else {
    const u = usage
      ? `tokens: prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} total=${usage.total_tokens}`
      : "tokens: n/a";
    console.log(
      `[extractor:tpl] ✓ doc=${documentId ?? "?"} tpl="${template.name}" time=${execMs}ms — ${u}`
    );
    if (fields) console.log("[extractor:tpl] →", fields);
  }

  // Disk dump for audit
  try {
    const dir = join(getDataDir(), "extractions");
    mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = (fileName ?? "doc").replace(/[^a-zA-Z0-9א-ת._-]/g, "_").slice(0, 80);
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
          input_text_preview: text.slice(0, 500),
          fields,
          raw_json: rawJson,
        },
        null, 2
      ),
      "utf-8"
    );
  } catch (writeErr) {
    console.warn(`[extractor:tpl] Failed to write dump: ${writeErr}`);
  }

  return { template, fields, rawJson, model, backend, execMs, error, usage };
}
