export interface Chunk {
  index: number;
  text: string;
  tokenEstimate: number;
}

// Rough token estimate: ~4 chars per token for mixed Hebrew/Latin
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkText(text: string, chunkSize = 800, overlap = 100): Chunk[] {
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  const chunks: Chunk[] = [];
  let current = "";
  let index = 0;

  for (const sentence of sentences) {
    if (estimateTokens(current + sentence) > chunkSize && current.length > 0) {
      chunks.push({ index: index++, text: current.trim(), tokenEstimate: estimateTokens(current) });
      // Keep last `overlap` tokens worth of text for context continuity
      const words = current.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      current = overlapWords.join(" ") + " " + sentence;
    } else {
      current += (current ? " " : "") + sentence;
    }
  }

  if (current.trim()) {
    chunks.push({ index: index, text: current.trim(), tokenEstimate: estimateTokens(current) });
  }

  return chunks;
}
