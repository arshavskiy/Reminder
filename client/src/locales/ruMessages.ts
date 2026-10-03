/**
 * Russian UI catalog. It is the English catalog with Russian translations laid over it,
 * so a string that has not been translated yet shows in English instead of breaking the
 * page. Translations are flat maps of dotted paths ("common.save": "Сохранить") in
 * `ru/*.ts`, one module per area of the app.
 */
import {ruCore} from "./ru/core.js";
import {ruTools} from "./ru/tools.js";
import {ruInspections} from "./ru/inspections.js";
import {ruProfile} from "./ru/profile.js";
import {ruDocuments} from "./ru/documents.js";
import {ruInvoices} from "./ru/invoices.js";
import {ruDashboard} from "./ru/dashboard.js";

export type FlatMessages = Record<string, string>;

type Tree = Record<string, unknown>;

function isTree(value: unknown): value is Tree {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Objects and arrays both hold nested strings (month names are arrays). */
function isContainer(value: unknown): value is Tree {
  return Boolean(value) && typeof value === "object";
}

function cloneTree<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneTree(item)) as unknown as T;
  if (isTree(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneTree(item)])) as T;
  return value;
}

/** Every Russian translation, merged. Later modules win over earlier ones on the same path. */
export const ruFlat: FlatMessages = {
  ...ruCore,
  ...ruDashboard,
  ...ruInvoices,
  ...ruDocuments,
  ...ruProfile,
  ...ruInspections,
  ...ruTools,
};

/** Sets `value` at a dotted path, creating objects on the way; paths that cross a string are ignored. */
export function setAtPath(tree: Tree, path: string, value: string): boolean {
  const keys = path.split(".");
  let node: Tree = tree;
  for (const key of keys.slice(0, -1)) {
    const next = node[key];
    if (!isContainer(next)) return false;
    node = next;
  }
  const last = keys[keys.length - 1];
  if (typeof node[last] !== "string") return false;
  node[last] = value;
  return true;
}

/** Deep copy of the English catalog with the Russian translations applied. */
export function buildRussianMessages<T extends Tree>(english: T, translations: FlatMessages = ruFlat): T {
  const result = cloneTree(english);
  for (const [path, value] of Object.entries(translations)) setAtPath(result, path, value);
  return result;
}

function leafPaths(tree: Tree, prefix = ""): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isContainer(value)) paths.push(...leafPaths(value, path));
    else if (typeof value === "string") paths.push(path);
  }
  return paths;
}

/** Dotted paths of English strings that have no Russian translation yet. */
export function untranslatedPaths(english: Tree, translations: FlatMessages = ruFlat): string[] {
  return leafPaths(english).filter((path) => typeof translations[path] !== "string");
}

/** Translations whose path does not exist in the English catalog (typos, removed keys). */
export function unknownTranslationPaths(english: Tree, translations: FlatMessages = ruFlat): string[] {
  const known = new Set(leafPaths(english));
  return Object.keys(translations).filter((path) => !known.has(path));
}
