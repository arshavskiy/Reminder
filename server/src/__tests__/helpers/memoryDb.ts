// Minimal in-memory stand-in for the Mongo `col()` helper, enough for route
// tests: equality / $in / $nin / $ne / $gte / $lte / $exists filters (dotted paths
// allowed), findOne, find().sort().skip().limit(), countDocuments, updateOne /
// updateMany with $set (dotted paths allowed) / $unset / $addToSet / upsert, insertOne
// and deleteOne.
import { ObjectId } from "mongodb";

export const memory = new Map<string, Record<string, any>[]>();

function getPath(row: any, path: string): any {
  if (!path.includes(".")) return row?.[path];
  return path.split(".").reduce((node, key) => (node === undefined || node === null ? undefined : node[key]), row);
}

function setPath(row: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = row;
  for (const key of keys.slice(0, -1)) {
    if (node[key] === undefined || node[key] === null || typeof node[key] !== "object") node[key] = {};
    node = node[key];
  }
  node[keys[keys.length - 1]] = value;
}

function matches(row: any, filter: any): boolean {
  return Object.entries(filter ?? {}).every(([key, cond]: [string, any]) => {
    if (key === "$or") return (cond as any[]).some((sub) => matches(row, sub));
    const value = key === "_id" && row._id?.toString ? row._id.toString() : getPath(row, key);
    const isOperator = cond && typeof cond === "object" && Object.keys(cond).some((k) => k.startsWith("$"));
    const want = key === "_id" && cond?.toString && typeof cond === "object" && !isOperator ? cond.toString() : cond;
    if (want && typeof want === "object" && "$in" in want) return want.$in.map(String).includes(String(value));
    if (want && typeof want === "object" && "$nin" in want) return !want.$nin.includes(value);
    if (want && typeof want === "object" && "$ne" in want) return String(value) !== String(want.$ne);
    if (want && typeof want === "object" && ("$gte" in want || "$lte" in want)) {
      return typeof value === "number" && (!("$gte" in want) || value >= want.$gte) && (!("$lte" in want) || value <= want.$lte);
    }
    if (want && typeof want === "object" && "$exists" in want) return (value !== undefined) === want.$exists;
    return value === want;
  });
}

export function rows(name: string): Record<string, any>[] {
  if (!memory.has(name)) memory.set(name, []);
  return memory.get(name)!;
}

function applyUpdate(row: any, update: any) {
  for (const [key, value] of Object.entries(update.$set ?? {})) setPath(row, key, value);
  for (const key of Object.keys(update.$unset ?? {})) delete row[key];
  for (const [key, value] of Object.entries(update.$addToSet ?? {})) {
    const list = Array.isArray(row[key]) ? row[key] : [];
    if (!list.includes(value)) list.push(value);
    row[key] = list;
  }
}

export function col(name: string) {
  const list = () => rows(name);
  const chain = (items: any[]) => ({
    sort: (spec?: Record<string, 1 | -1>) => {
      const [key, dir] = Object.entries(spec ?? {})[0] ?? [];
      if (!key) return chain(items);
      const sorted = [...items].sort((a, b) => {
        const left = getPath(a, key);
        const right = getPath(b, key);
        if (left === right) return 0;
        return (left > right ? 1 : -1) * (dir === -1 ? -1 : 1);
      });
      return chain(sorted);
    },
    skip: (n: number) => chain(items.slice(n)),
    limit: (n: number) => chain(items.slice(0, n)),
    toArray: async () => items,
  });
  return {
    findOne: async (filter: any) => list().find((row) => matches(row, filter)) ?? null,
    find: (filter: any) => chain(list().filter((row) => matches(row, filter))),
    countDocuments: async (filter: any) => list().filter((row) => matches(row, filter)).length,
    insertOne: async (doc: any) => {
      doc._id ??= new ObjectId();
      list().push(doc);
      return { insertedId: doc._id };
    },
    deleteOne: async (filter: any) => {
      const index = list().findIndex((row) => matches(row, filter));
      if (index >= 0) list().splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    },
    updateOne: async (filter: any, update: any, options?: { upsert?: boolean }) => {
      let row = list().find((r) => matches(r, filter));
      if (!row) {
        if (!options?.upsert) return { matchedCount: 0, modifiedCount: 0 };
        row = Object.fromEntries(Object.entries(filter).filter(([, v]) => typeof v !== "object"));
        list().push(row);
      }
      applyUpdate(row, update);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    updateMany: async (filter: any, update: any) => {
      const targets = list().filter((row) => matches(row, filter));
      for (const row of targets) applyUpdate(row, update);
      return { matchedCount: targets.length, modifiedCount: targets.length };
    },
  };
}
