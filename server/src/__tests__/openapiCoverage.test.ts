import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { scanRoutes } from "../docs/routeScan";

// Fails when a route is added without an entry in docs/openapi.yaml, or when an
// entry is not usable in Swagger UI. To fill gaps run
// `npx tsx scripts/openapiGenerate.ts` from the server directory (it needs a
// summary in scripts/openapiSummaries.ts) and refine the generated entry.
const SRC = join(__dirname, "..");
const spec = parse(readFileSync(join(SRC, "..", "..", "docs", "openapi.yaml"), "utf8")) as any;
const routes = scanRoutes(SRC);
const METHODS = ["get", "post", "put", "patch", "delete"];

describe("OpenAPI spec", () => {
  it("scans a plausible number of routes", () => {
    expect(routes.length).toBeGreaterThan(250);
  });

  it("documents every Express route", () => {
    const missing = routes
      .filter((r) => !spec.paths?.[r.openapiPath]?.[r.method])
      .map((r) => `${r.method.toUpperCase()} ${r.openapiPath} (${r.file})`);
    expect(missing).toEqual([]);
  });

  it("does not document routes that no longer exist", () => {
    const real = new Set(routes.map((r) => `${r.method} ${r.openapiPath}`));
    const stale: string[] = [];
    for (const [path, ops] of Object.entries<any>(spec.paths)) {
      for (const method of Object.keys(ops).filter((m) => METHODS.includes(m))) {
        if (!real.has(`${method} ${path}`)) stale.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("gives every operation a summary, a tag and responses", () => {
    const bad: string[] = [];
    for (const [path, ops] of Object.entries<any>(spec.paths)) {
      for (const method of Object.keys(ops).filter((m) => METHODS.includes(m))) {
        const op = ops[method];
        if (!op.summary || !Array.isArray(op.tags) || !op.tags.length || !op.responses || !Object.keys(op.responses).length) {
          bad.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("declares every path parameter of every operation", () => {
    const bad: string[] = [];
    for (const [path, ops] of Object.entries<any>(spec.paths)) {
      const names = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const method of Object.keys(ops).filter((m) => METHODS.includes(m))) {
        const declared = new Set((ops[method].parameters ?? []).filter((p: any) => p.in === "path").map((p: any) => p.name));
        for (const name of names) if (!declared.has(name)) bad.push(`${method.toUpperCase()} ${path} {${name}}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("resolves every $ref", () => {
    const refs = [...JSON.stringify(spec).matchAll(/"\$ref":"#\/([^"]+)"/g)].map((m) => m[1]);
    const unresolved = refs.filter((ref) => ref.split("/").reduce((node: any, key) => node?.[key], spec) === undefined);
    expect(unresolved).toEqual([]);
  });

  it("keeps public routes free of the session cookie requirement", () => {
    for (const [path, method] of [
      ["/api/calendar/feed/{file}", "get"],
      ["/api/webhooks/resend", "post"],
      ["/api/billing/tier", "post"],
    ] as const) {
      expect(spec.paths[path][method].security).toEqual([]);
    }
  });
});
