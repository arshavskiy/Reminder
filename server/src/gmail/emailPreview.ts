const PREVIEW_HTML_MAX = 180_000;

/** Keeps the receipt layout and drops anything that can run in the preview frame. */
export function sanitizeEmailPreviewHtml(raw: string | null | undefined): string | null {
  const source = String(raw ?? "").trim();
  if (!source) return null;
  const withoutActive = source
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/<link[\s\S]*?>/gi, "")
    .replace(/<meta[\s\S]*?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '$1="#"');
  const clipped = withoutActive.slice(0, PREVIEW_HTML_MAX);
  return clipped.trim() || null;
}

export function emailBodyToPreviewHtml(html: string | null, plain: string | null): string | null {
  const safeHtml = sanitizeEmailPreviewHtml(html);
  if (safeHtml) return safeHtml;
  const text = String(plain ?? "").trim();
  if (!text) return null;
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre style="white-space:pre-wrap;font-family:Segoe UI,Arial,sans-serif">${escaped.slice(0, PREVIEW_HTML_MAX)}</pre>`;
}
