// Render an email-template string with Mustache-style {{var}} substitution.
//
// Supported placeholders:
//   {{var_name}}          — straight lookup in the variables map
//   {{var_name|fallback}} — value if present, else fallback literal
//   {{#if var}}...{{/if}} — block shown only when `var` is non-empty
//   {{items_table}}       — HTML table of grouped reminder rows (empty on a single send)
//
// Intentionally tiny — no dependencies. Good enough for email templates where
// the data shape is well-known.

export type EmailVars = Record<string, string | number | null | undefined>;

const IF_BLOCK = /\{\{#if\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
const VAR_TOKEN = /\{\{\s*([a-zA-Z0-9_]+)(?:\s*\|\s*([^}]*?))?\s*\}\}/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTemplate(template: string, vars: EmailVars, opts: { escape?: boolean } = {}): string {
  const escape = opts.escape ?? true;

  // Pass 1: {{#if var}}...{{/if}} blocks
  let out = template.replace(IF_BLOCK, (_, name: string, body: string) => {
    const v = vars[name];
    return v !== undefined && v !== null && v !== "" ? body : "";
  });

  // Pass 2: {{var}} and {{var|fallback}}
  out = out.replace(VAR_TOKEN, (_, name: string, fallback?: string) => {
    const v = vars[name];
    const str =
      v !== undefined && v !== null && v !== ""
        ? String(v)
        : (fallback ?? "").trim();
    return escape ? escapeHtml(str) : str;
  });

  return out;
}

/** Find all {{varname}} tokens in a template (for the UI variable preview). */
export function listTemplateVars(template: string): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  const re = /\{\{(?:#if\s+)?([a-zA-Z0-9_]+)(?:\s*\|[^}]*)?\}\}/g;
  while ((m = re.exec(template))) set.add(m[1]);
  return [...set];
}
