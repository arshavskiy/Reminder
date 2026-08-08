// Ad-hoc test extraction — runs an extraction with a caller-supplied prompt
// (as typed in the admin UI, NOT persisted) so admins can iterate on prompts
// before saving. Uses the current effective model/backend.

import OpenAI from "openai";
import {getEffectiveSettings} from "../effectiveSettings.js";
import {logger} from "../logger";

export interface TestExtractionResult {
  result: unknown | null;   // parsed JSON object
  rawJson: string;
  model: string;
  backend: string;
  execMs: number;
  error: string | null;
  usage: {prompt_tokens: number; completion_tokens: number; total_tokens: number} | null;
}

export async function runTestExtraction(
  systemPrompt: string,
  sampleText: string
): Promise<TestExtractionResult> {
  const settings = await getEffectiveSettings();
  const backend = settings.aiBackend;
  const model = backend === "ollama" ? settings.ollamaModel : settings.openAiModel;
  const text = sampleText.slice(0, settings.extractionMaxChars);

  const client =
    backend === "ollama"
      ? new OpenAI({baseURL: `${settings.ollamaUrl}/v1`, apiKey: "ollama"})
      : new OpenAI({apiKey: settings.openAiKey});

  const t0 = Date.now();
  let rawJson = "";
  let result: unknown | null = null;
  let error: string | null = null;
  let usage: TestExtractionResult["usage"] = null;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {role: "system", content: systemPrompt},
        {role: "user", content: `Document text:\n\n${text}`},
      ],
      response_format: {type: "json_object"},
      temperature: 0,
    });
    rawJson = response.choices[0]?.message?.content ?? "";
    result = JSON.parse(rawJson);
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
  logger.info("test_extraction_run", {backend, model, exec_ms: execMs, ok: !error, prompt_chars: systemPrompt.length});
  return {result, rawJson, model, backend, execMs, error, usage};
}
