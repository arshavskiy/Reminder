import {exec} from "child_process";
import {promisify} from "util";

const execAsync = promisify(exec);

const FALLBACK_MODELS = ["qwen3:4b", "qwen3:1.7b"];

/**
 * List locally-pulled Ollama models via `ollama list`. Falls back to a
 * static suggested list if Ollama isn't installed/running — the interactive
 * flow still lets the user type a model name manually in that case.
 */
export async function listOllamaModels(): Promise<string[]> {
  try {
    const { stdout } = await execAsync("ollama list", { timeout: 5000 });
    const lines = stdout.trim().split("\n").slice(1); // skip header row
    const names = lines
      .map((l) => l.trim().split(/\s{2,}/)[0])
      .filter((name): name is string => Boolean(name));
    return names.length > 0 ? names : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

export const RECOMMENDED_MODEL = "qwen3:4b";
