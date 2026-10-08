import type {StorageLike} from "./tableState";
export interface SavedView { name: string; state: Record<string, unknown> }
export function savedViewsKey(userId: string | number, page: string): string {
  return `ui.savedViews.${encodeURIComponent(String(userId))}.${encodeURIComponent(page)}`;
}
export function readSavedViews(storage: StorageLike, key: string): SavedView[] {
  try {
    const value = JSON.parse(storage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is SavedView => v && typeof v.name === "string" && v.name.trim().length > 0
      && v.name.length <= 60 && v.state && typeof v.state === "object" && !Array.isArray(v.state)).slice(0, 20);
  } catch { return []; }
}
export function writeSavedView(storage: StorageLike, key: string, name: string, state: Record<string, unknown>): SavedView[] {
  name = name.trim();
  if (!name || name.length > 60) throw new Error("Invalid view name");
  const views = readSavedViews(storage, key);
  const index = views.findIndex(v => v.name === name);
  if (index < 0 && views.length >= 20) throw new Error("Saved view limit reached");
  const value = {name, state: JSON.parse(JSON.stringify(state))};
  if (index < 0) views.push(value); else views[index] = value;
  storage.setItem(key, JSON.stringify(views));
  return views;
}
export function deleteSavedView(storage: StorageLike, key: string, name: string): SavedView[] {
  const views = readSavedViews(storage, key).filter(v => v.name !== name);
  storage.setItem(key, JSON.stringify(views));
  return views;
}
