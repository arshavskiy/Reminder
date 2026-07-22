function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface HtmlWriterInput {
  fileName: string;
  text: string;
  tables: string[][][]; // one or more merged tables, each [row][col]
}

/** Self-contained HTML document — inline styles, no external assets. */
export function toHtml({ fileName, text, tables }: HtmlWriterInput): string {
  const tablesHtml = tables
    .map((table, i) => {
      const [header, ...rows] = table;
      const headHtml = header
        ? `<thead><tr>${header.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>`
        : "";
      const bodyHtml = `<tbody>${rows
        .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody>`;
      return `<h2>Table ${i + 1}</h2><table>${headHtml}${bodyHtml}</table>`;
    })
    .join("\n");

  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<title>${escapeHtml(fileName)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  h1 { font-size: 1.2rem; word-break: break-all; }
  h2 { font-size: 1.05rem; margin-top: 2rem; }
  pre { white-space: pre-wrap; direction: rtl; text-align: right; background: #f5f5f5; padding: 1rem; border-radius: 6px; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.5rem; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: right; font-size: 0.9rem; }
  th { background: #eee; }
  @media (prefers-color-scheme: dark) {
    body { background: #1a1a1a; color: #eee; }
    pre { background: #2a2a2a; }
    th, td { border-color: #444; }
    th { background: #333; }
  }
</style>
</head>
<body>
<h1>${escapeHtml(fileName)}</h1>
${tablesHtml}
<h2>Extracted text</h2>
<pre>${escapeHtml(text)}</pre>
</body>
</html>
`;
}
