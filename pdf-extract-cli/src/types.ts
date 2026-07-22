export interface AskRun {
  answer: string | null;
  model: string;
  execMs: number;
  error: string | null;
  usage: { prompt_tokens: number; completion_tokens: number } | null;
}
