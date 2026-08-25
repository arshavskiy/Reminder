import {describe, expect, it} from "vitest";
import {readFileSync} from "fs";
import {join} from "path";

/**
 * MongoDB rejects an update naming the same path in both $setOnInsert and $set
 * ("Updating the path 'x' would create a conflict at 'x'"), which made every
 * upload that enqueued a processing job fail with a 500 while still creating
 * the document row — leaving documents queued with no job to run them.
 *
 * Asserted against the source because exercising it needs a live mongod.
 */
describe("enqueueDocumentProcessingJob upsert", () => {
  it("never names the same field in $setOnInsert and $set", () => {
    const source = readFileSync(join(__dirname, "../pipeline/importer.ts"), "utf-8");

    const start = source.indexOf("async function enqueueDocumentProcessingJob");
    expect(start).toBeGreaterThan(-1);
    const next = source.indexOf("\nexport function startDocumentProcessingJobWorker", start);
    const body = source.slice(start, next === -1 ? source.length : next);

    const block = (operator: string): string => {
      const at = body.indexOf(`${operator}: {`);
      if (at === -1) return "";
      let depth = 0;
      for (let i = at + operator.length + 1; i < body.length; i += 1) {
        if (body[i] === "{") depth += 1;
        if (body[i] === "}") {
          depth -= 1;
          if (depth === 0) return body.slice(at, i + 1);
        }
      }
      return "";
    };

    // Top-level keys of the operator object only, ignoring nested objects.
    const keysOf = (text: string): string[] => {
      const inner = text.slice(text.indexOf("{") + 1, text.lastIndexOf("}"));
      const keys: string[] = [];
      let depth = 0;
      for (const line of inner.split("\n")) {
        const trimmed = line.trim();
        if (depth === 0) {
          const match = /^([a-z_][a-z0-9_]*)\s*:/i.exec(trimmed);
          if (match) keys.push(match[1]);
        }
        depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      }
      return keys;
    };

    const onInsert = keysOf(block("$setOnInsert"));
    const set = keysOf(block("$set"));

    expect(onInsert.length).toBeGreaterThan(0);
    expect(set.length).toBeGreaterThan(0);

    const overlap = onInsert.filter((key) => set.includes(key));
    expect(overlap).toEqual([]);
  });
});
