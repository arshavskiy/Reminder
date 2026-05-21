import type { DocTemplate, TemplateField } from "../../src/shared/types.js";

const TYPE_DESCRIPTIONS: Record<TemplateField["type"], string> = {
  text: "string | null",
  number: "number | null",
  date: '"YYYY-MM-DD" | null  (Hebrew calendar → Gregorian; DD/MM/YYYY → ISO)',
  phone: 'string | null  (keep original Israeli format, e.g. "050-1234567")',
  email: "string | null",
  currency: "number | null",
  list: "string[]  (empty array if none)",
};

/**
 * Build a Hebrew-aware system prompt for OpenAI/Ollama based on the user's template.
 * The prompt asks the model to return ONE flat JSON object whose keys are the
 * template's field `key`s.
 */
export function buildPromptForTemplate(tpl: DocTemplate): string {
  const fieldLines = tpl.fields
    .map((f) => {
      const parts: string[] = [];
      parts.push(`  "${f.key}": ${TYPE_DESCRIPTIONS[f.type]}`);
      const hints: string[] = [];
      hints.push(`label: "${f.label_he}"`);
      if (f.required) hints.push("required");
      if (f.hint_he) hints.push(`hint: ${f.hint_he}`);
      if (f.example_he) hints.push(`example: ${f.example_he}`);
      parts.push(`    // ${hints.join(" · ")}`);
      return parts.join("\n");
    })
    .join(",\n");

  const expiryNote = tpl.expiry_field
    ? `\nIMPORTANT: the field "${tpl.expiry_field}" represents the FUTURE DATE the user must be reminded about. Always pick the next-action date, NOT the issue date.`
    : "";

  return `You are a document intelligence assistant specializing in Hebrew business documents.
The user has defined a template called "${tpl.name}". Extract structured information
from the provided document text and return ONLY ONE valid JSON object whose keys
match the schema below EXACTLY.

GENERAL RULES:
• All dates must be normalized to ISO 8601 (YYYY-MM-DD). Hebrew calendar → convert to Gregorian. Israeli DD/MM/YYYY → YYYY-MM-DD.
• Phone numbers: keep original Israeli format (e.g. "050-1234567").
• If a field cannot be determined, use null (or [] for list types).
• Do not invent data. Do not add fields not in the schema.
• The text may have residual bidi/encoding artifacts from PDF extraction — use context.
${expiryNote}

JSON schema:
{
${fieldLines},
  "_confidence": "high" | "medium" | "low"   // your own confidence in the extraction
}`;
}
