import { describe, expect, it } from "vitest";
import { appMessages } from "../../../client/src/locales/appMessages";
import { ruFlat, unknownTranslationPaths } from "../../../client/src/locales/ruMessages";

const placeholders = (text: string) => (text.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(",");

function leaves(tree: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof tree === "string") out[prefix] = tree;
  else if (tree && typeof tree === "object") {
    for (const [key, value] of Object.entries(tree)) leaves(value, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

describe("Russian UI catalog", () => {
  const english = leaves(appMessages.en);

  it("has no translation for a path missing from the English catalog", () => {
    expect(unknownTranslationPaths(appMessages.en as never)).toEqual([]);
  });

  it("keeps every {placeholder} of the English string", () => {
    const broken = Object.entries(ruFlat)
      .filter(([path, text]) => path in english && placeholders(text) !== placeholders(english[path]))
      .map(([path]) => path);
    expect(broken).toEqual([]);
  });

  it("falls back to English for strings without a translation", () => {
    const russian = leaves(appMessages.ru);
    expect(Object.keys(russian).sort()).toEqual(Object.keys(english).sort());
    expect(russian["common.save"]).toBe(ruFlat["common.save"]);
  });

  it("translates the core navigation and dashboard", () => {
    const russian = leaves(appMessages.ru);
    for (const path of Object.keys(english).filter((p) => /^(chrome|dashboard|invoices|review)\./.test(p))) {
      expect(russian[path], path).toBeTruthy();
    }
  });
});
