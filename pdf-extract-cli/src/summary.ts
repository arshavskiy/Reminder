import type {PipelineResult} from "./pipeline.js";

const PREVIEW_CHARS = 500;

/**
 * Human-readable rendering of a PipelineResult — used both for the
 * interactive results screen and the saved .summary.txt file, so the two
 * never drift apart. The full extracted text is written separately to
 * <name>.txt; this is a preview + any Q&A, not the full document.
 */
export function formatSummary(result: PipelineResult): string {
  const lines: string[] = [];
  lines.push(result.file);
  lines.push("=".repeat(Math.min(result.file.length, 70)));

  lines.push(`  OCR used: ${result.usedOcr ? `yes (${result.ocrReason ?? "unknown reason"})` : "no"}`);
  lines.push(`  Extracted text length: ${result.rawTextChars} chars`);

  if (result.csv) {
    const originalLines = result.text.split("\n").filter((l) => l.trim()).length;
    lines.push(
      "",
      "Table detected — CSV extracted. Rough sanity comparison (not a strict correctness" +
        " check — a table's rows don't map 1:1 to raw text lines):"
    );
    lines.push(`  Original text lines: ${originalLines}`);
    lines.push(`  CSV rows extracted:  ${result.csvRowCount}`);
  }

  if (result.answer) {
    if (result.answer.error) {
      lines.push("", `AI question FAILED (${result.answer.model}): ${result.answer.error}`);
    } else {
      lines.push("", `AI answer (${result.answer.model}, ${result.answer.execMs}ms):`);
      lines.push(result.answer.answer ?? "(no answer returned)");
    }
  }

  lines.push("", "Text preview:");
  const preview = result.text.slice(0, PREVIEW_CHARS).trim();
  lines.push(preview + (result.text.length > PREVIEW_CHARS ? "…" : ""));

  return lines.join("\n");
}
