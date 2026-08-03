export function normalizeClientDisplayName(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const spaced = value
    .replace(/[״“”]/g, "\"")
    .replace(/[׳‘’`]/g, "'")
    .replace(/בע\s*[\\\/"]\s*מ'?/g, "בע\"מ")
    .replace(/בע\s+מ'?/g, "בע\"מ")
    .replace(/([א-ת])(\d{2,})/g, "$1 $2")
    .replace(/(\d{2,})([א-ת])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  const numericPrefix = spaced.match(/^(\d{3,4})\s+(.+[\u0590-\u05FF].*)$/);
  if (numericPrefix) return `${numericPrefix[2].trim()} ${numericPrefix[1]}`;

  return spaced;
}

export function clientDisplayName(value: unknown): string | null {
  const normalized = normalizeClientDisplayName(value);
  return typeof normalized === "string" && normalized.trim() ? normalized.trim() : null;
}
