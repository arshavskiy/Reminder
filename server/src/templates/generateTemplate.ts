// AI-driven template generator. Given a sample document's raw text, ask the
// model to propose a Hebrew DocTemplate: name, match keywords, field list,
// and which field is the "next-action date" that drives reminders.
//
// This is the inverse of `buildPromptForTemplate`: instead of using a template
// to extract data, we use a sample document to design a template.

import OpenAI from "openai";
import {getSettings} from "../settings";
import type {DocTemplate, TemplateField} from "../../src/shared/types.js";
import {logger} from "../logger";

const SYSTEM_PROMPT = `You are a Hebrew business-document analyst. The user will give you a sample document's raw text (in Hebrew, possibly with bidi/encoding artifacts from a PDF). Your job: design a reusable extraction template for documents of THIS KIND.

Return ONLY JSON matching the schema below. All Hebrew labels must be in Hebrew. Field keys must be lowercase snake_case English (e.g. "client_company", "expiry_date") so they can be referenced from code.

Choose field types from: text, number, date, phone, email, currency, list.

CRITICAL — read carefully:
1. Look ONLY at the actual sample text. Do not assume the document type from training data. If the sample is a vehicle license, name it "רישיון רכב" — do NOT call it "תסקיר בדיקה".
2. The template "name" must precisely match the document type as it appears in the sample (or a natural Hebrew name for it).
3. Include ONLY fields that actually appear in the sample. Don't add typical fields that aren't there. If the sample has no phone number, don't add "contact_phone".
4. If the document has a buyer/customer/owner, include an identity field (call it client_company for companies or owner_name for individuals).
5. Include a UNIQUE document number field if present (license_number / contract_number / report_number / invoice_number — pick what fits).
6. "expiry_field" must point to the FUTURE DATE the user must act on — the date that should drive a reminder email. Examples by doc type:
   - Vehicle license / certificate → "expiry_date" / "valid_until"
   - Inspection report → "expiry_date"
   - Invoice → "payment_due_date"
   - Contract → "expiry_date"
   Never pick the issue date. If the sample has no future-action date, set "expiry_field" to null.
7. match_keywords: 3–6 Hebrew strings copied DIRECTLY from the sample (or very close), that would only appear in this document type. Pick distinctive phrases (e.g. "רישיון רכב", "מספר רישיון"), NOT generic words like "תאריך" or "שם".
8. Be conservative — small precise templates beat large speculative ones.

JSON schema:
{
  "name": string,            // Hebrew template name matching the actual document type
  "description": string,     // Hebrew, 1–2 sentences
  "match_keywords": string[],
  "fields": [
    {
      "key": "snake_case_key",
      "label_he": "Hebrew label",
      "type": "text"|"number"|"date"|"phone"|"email"|"currency"|"list",
      "required": boolean,
      "hint_he": "optional Hebrew hint to help the AI extract this field"
    }
  ],
  "expiry_field": "key_of_the_action_date_field" | null
}`;

export interface GeneratedTemplate {
  name: string;
  description: string;
  match_keywords: string[];
  fields: TemplateField[];
  expiry_field: string | null;
}

export interface GenerateRun {
  template: GeneratedTemplate | null;
  rawJson: string;
  error: string | null;
  model: string;
  backend: string;
  execMs: number;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}

function buildClient(settings: ReturnType<typeof getSettings>) {
  if (settings.aiBackend === "ollama") {
    return new OpenAI({ baseURL: `${settings.ollamaUrl}/v1`, apiKey: "ollama" });
  }
  return new OpenAI({ apiKey: settings.openAiKey });
}

export async function generateTemplateFromText(sampleText: string): Promise<GenerateRun> {
  const settings = getSettings();
  const model = settings.aiBackend === "ollama" ? settings.ollamaModel : settings.openAiModel;
  const backend = settings.aiBackend;
  const text = sampleText.slice(0, settings.extractionMaxChars);

  const t0 = Date.now();
  let rawJson = "";
  let template: GeneratedTemplate | null = null;
  let error: string | null = null;
  let usage: GenerateRun["usage"] = null;

  try {
    const client = buildClient(settings);
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Sample document text:\n\n${text}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    rawJson = response.choices[0]?.message?.content ?? "";
    template = JSON.parse(rawJson) as GeneratedTemplate;

    // Light validation — make sure required keys exist
    if (!template.name || !Array.isArray(template.fields)) {
      throw new Error("Model returned malformed template");
    }
    template.match_keywords = template.match_keywords ?? [];
    template.expiry_field = template.expiry_field ?? null;

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
  if (error) {
    logger.error("template_generation_failed", { backend, model, exec_ms: execMs, error });
  } else {
    logger.info("template_generation_completed", {
      backend,
      model,
      exec_ms: execMs,
      template_name: template?.name ?? null,
      field_count: template?.fields.length ?? 0,
      usage,
    });
  }

  return { template, rawJson, error, model, backend, execMs, usage };
}

/**
 * Convert a GeneratedTemplate (AI output) into a saveable DocTemplate
 * shape. Returns the same structure used by the editor — the user can
 * tweak it before saving.
 */
export function toDraft(g: GeneratedTemplate): Omit<DocTemplate, "id" | "created_at" | "updated_at"> {
  return {
    name: g.name,
    description: g.description,
    document_kind: "unknown",
    match_keywords: g.match_keywords,
    fields: g.fields,
    expiry_field: g.expiry_field,
    cached_system_prompt: null,
    is_default: 0,
    is_builtin: 0,
  };
}
