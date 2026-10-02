// Minimal in-memory stand-in for the Mongo `col()` helper, enough for route
// tests: equality / $in / $nin / $ne / $gte / $lte / $exists filters, findOne, find().sort().limit(),
// updateOne with $set / $unset / upsert, insertOne and deleteOne.
export const memory = new Map<string, Record<string, any>[]>();

function matches(row: any, filter: any): boolean {
  return Object.entries(filter ?? {}).every(([key, cond]: [string, any]) => {
    if (key === "$or") return (cond as any[]).some((sub) => matches(row, sub));
    const value = key === "_id" && row._id?.toString ? row._id.toString() : row[key];
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

export function col(name: string) {
  const list = () => rows(name);
  const chain = (items: any[]) => ({
    sort: () => chain(items),
    limit: (n: number) => chain(items.slice(0, n)),
    toArray: async () => items,
  });
  return {
    findOne: async (filter: any) => list().find((row) => matches(row, filter)) ?? null,
    find: (filter: any) => chain(list().filter((row) => matches(row, filter))),
    insertOne: async (doc: any) => { list().push(doc); return { insertedId: doc._id }; },
    deleteOne: async (filter: any) => {
      const index = list().findIndex((row) => matches(row, filter));
      if (index >= 0) list().splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    },
    updateOne: async (filter: any, update: any, options?: { upsert?: boolean }) => {
      let row = list().find((r) => matches(r, filter));
      if (!row) {
        if (!options?.upsert) return { matchedCount: 0 };
        row = Object.fromEntries(Object.entries(filter).filter(([, v]) => typeof v !== "object"));
        list().push(row);
      }
      Object.assign(row, update.$set ?? {});
      for (const key of Object.keys(update.$unset ?? {})) delete row[key];
      for (const [key, value] of Object.entries(update.$addToSet ?? {})) {
        const list = Array.isArray(row![key]) ? row![key] : [];
        if (!list.includes(value)) list.push(value);
        row![key] = list;
      }
      return { matchedCount: 1 };
    },
  };
}
