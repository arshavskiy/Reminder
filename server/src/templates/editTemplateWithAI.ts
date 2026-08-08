// AI-assisted template editor (admin authoring tool).
//
// Given an existing template (its fields/JSON-schema + its full extraction prompt)
// and a natural-language instruction from an admin, ask a STRONG model to produce
// an updated version — a rewritten full_prompt_override AND an updated field list,
// kept mutually consistent (the prompt must describe exactly the fields the schema
// declares). The caller returns the proposal to the UI for a diff preview; nothing
// is persisted here.

import OpenAI from "openai";
import {getEffectiveSettings} from "../effectiveSettings.js";
import {buildPromptForTemplate} from "./buildPrompt.js";
import type {DocTemplate, TemplateField} from "../../src/shared/types.js";
import {logger} from "../logger";

const EDITOR_SYSTEM_PROMPT = `You are an expert prompt engineer and Hebrew document-extraction specialist.
You maintain extraction "templates". Each template has:
  - a JSON schema: a list of fields (key in lowercase snake_case English, Hebrew label, type, hint)
  - a full system prompt: the complete instructions given to an extraction model, telling it how to
    read a Hebrew business/technical document (with PDF bidi artifacts) and return ONE JSON object
    whose keys are the field keys.

The admin will give you the CURRENT template (fields + full prompt) and an INSTRUCTION describing a
change (e.g. "add a field for the vehicle plate number", "be stricter about serial numbers",
"support a new use case: rental contracts", "make it return amounts as numbers").

Your job: return an UPDATED template that satisfies the instruction.

HARD RULES:
1. Keep the prompt and the field list CONSISTENT. Every field key in "fields" must be described in the
   prompt's JSON schema section, and the prompt must not reference fields that are not in "fields".
2. Preserve everything the instruction does not ask to change. Do not drop existing rules, BiDi/encoding
   guidance, or fields unless the instruction requires it.
3. Field keys: lowercase snake_case English. Labels: Hebrew. Types from: text, number, date, phone, email, currency, list.
4. The full prompt must instruct the model to return ONLY ONE valid JSON object and to use null / [] when a
   value is absent. Keep all existing Hebrew-PDF handling guidance (bidi, reversed emails, company numbers).
5. Do not invent data or examples that contradict the instruction.

Return ONLY JSON matching this schema:
{
  "description": string,                 // short Hebrew description of the template
  "expiry_field": string | null,         // key of the future-action date that drives reminders
  "fields": [
    { "key": "snake_case", "label_he": "Hebrew", "type": "text"|"number"|"date"|"phone"|"email"|"currency"|"list", "required": boolean, "hint_he": "optional Hebrew hint" }
  ],
  "full_prompt_override": string,        // the COMPLETE updated extraction prompt (self-contained)
  "change_summary": string               // 1-3 sentences (Hebrew or English) describing what you changed
}`;

export interface AIEditProposal {
  description: string;
  expiry_field: string | null;
  fields: TemplateField[];
  full_prompt_override: string;
  change_summary: string;
}

export interface AIEditRun {
  proposal: AIEditProposal | null;
  rawJson: string;
  error: string | null;
  model: string;
  backend: string;
  execMs: number;
  usage: {prompt_tokens: number; completion_tokens: number; total_tokens: number} | null;
}

function buildClient(backend: string, openAiKey: string, ollamaUrl: string) {
  if (backend === "ollama") {
    return new OpenAI({baseURL: `${ollamaUrl}/v1`, apiKey: "ollama"});
  }
  return new OpenAI({apiKey: openAiKey});
}

/**
 * Produce an AI-proposed edit of a template from an admin instruction.
 * Uses the configured promptEditorModel (a strong model), NOT the extraction model.
 */
export async function editTemplateWithAI(
  template: DocTemplate,
  instruction: string
): Promise<AIEditRun> {
  const settings = await getEffectiveSettings();
  const backend = settings.aiBackend;
  // The editor always uses the strong authoring model; falls back to the extraction model.
  const model =
    settings.promptEditorModel?.trim() ||
    (backend === "ollama" ? settings.ollamaModel : settings.openAiModel);

  // The current full prompt: explicit override if present, else the generated one.
  const currentPrompt = template.full_prompt_override?.trim() || buildPromptForTemplate(template);

  const currentTemplateJson = JSON.stringify(
    {
      name: template.name,
      description: template.description,
      expiry_field: template.expiry_field,
      fields: template.fields,
    },
    null,
    2
  );

  const userMessage =
    `CURRENT TEMPLATE (fields / JSON schema):\n${currentTemplateJson}\n\n` +
    `CURRENT FULL PROMPT:\n"""\n${currentPrompt}\n"""\n\n` +
    `INSTRUCTION:\n${instruction.trim()}\n\n` +
    `Return the updated template as JSON per the schema. The full_prompt_override must be the COMPLETE new prompt.`;

  const t0 = Date.now();
  let rawJson = "";
  let proposal: AIEditProposal | null = null;
  let error: string | null = null;
  let usage: AIEditRun["usage"] = null;

  try {
    const client = buildClient(backend, settings.openAiKey, settings.ollamaUrl);
    const response = await client.chat.completions.create({
      model,
      messages: [
        {role: "system", content: EDITOR_SYSTEM_PROMPT},
        {role: "user", content: userMessage},
      ],
      response_format: {type: "json_object"},
      temperature: 0.2,
    });
    rawJson = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(rawJson) as AIEditProposal;

    if (!parsed.full_prompt_override?.trim() || !Array.isArray(parsed.fields)) {
      throw new Error("Model returned malformed proposal (missing full_prompt_override or fields)");
    }
    parsed.expiry_field = parsed.expiry_field ?? null;
    parsed.description = parsed.description ?? template.description ?? "";
    parsed.change_summary = parsed.change_summary ?? "";
    proposal = parsed;

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
    logger.error("template_ai_edit_failed", {template_id: template.id, model, exec_ms: execMs, error});
  } else {
    logger.info("template_ai_edit_completed", {
      template_id: template.id,
      model,
      exec_ms: execMs,
      fields: proposal?.fields.length ?? 0,
      prompt_chars: proposal?.full_prompt_override.length ?? 0,
      usage,
    });
  }

  return {proposal, rawJson, error, model, backend, execMs, usage};
}
