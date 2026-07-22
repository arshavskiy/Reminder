import type {Config} from "./config.js";
import type {AskRun} from "./types.js";

const SYSTEM_PROMPT = `You are a helpful assistant answering questions about the text of a document the user provides. The text may have been extracted via OCR or PDF parsing and could contain residual formatting artifacts (including reversed-order Hebrew text from PDF bidi issues) — use context to read through minor artifacts. Answer concisely and only from the given text. If the answer isn't in the text, say so plainly instead of guessing.`;

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export async function askAboutDocument(
  rawText: string,
  question: string,
  config: Config,
  modelOverride?: string
): Promise<AskRun> {
  const model = modelOverride ?? config.ollamaModel;
  const text = rawText.slice(0, config.extractionMaxChars);

  const t0 = Date.now();
  let error: string | null = null;
  let answer: string | null = null;
  let usage: AskRun["usage"] = null;

  try {
    const res = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Document text:\n\n${text}\n\nQuestion: ${question}` },
        ],
        options: { temperature: 0, num_ctx: config.ollamaNumCtx },
        stream: false,
        // Reasoning models (qwen3, etc.) default to emitting a long <think>
        // chain-of-thought before the answer — very slow on a 4GB card with
        // partial CPU offload. Ollama ignores this field for non-reasoning
        // models.
        think: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    if (data.error) throw new Error(data.error);

    answer = (data.message?.content ?? "").trim() || null;
    usage = {
      prompt_tokens: data.prompt_eval_count ?? 0,
      completion_tokens: data.eval_count ?? 0,
    };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const execMs = Date.now() - t0;

  if (error) {
    console.error(`[ask] ❌ model=${model} time=${execMs}ms — ${error}`);
  } else {
    const u = usage
      ? `tokens: prompt=${usage.prompt_tokens} completion=${usage.completion_tokens}`
      : "tokens: n/a";
    console.log(`[ask] ✓ model=${model} time=${execMs}ms — ${u}`);
  }

  return { answer, model, execMs, error, usage };
}
