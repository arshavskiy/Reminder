import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";

// Static scan of the Express route registrations. It feeds the OpenAPI
// generator (scripts/openapiGenerate.ts) and the coverage test that fails when a
// route is added without a matching entry in docs/openapi.yaml.

export type ScannedRoute = {
  method: "get" | "post" | "put" | "patch" | "delete";
  /** Express style path, e.g. /api/clients/:id */
  path: string;
  /** OpenAPI style path, e.g. /api/clients/{id} */
  openapiPath: string;
  file: string;
  pathParams: string[];
  queryParams: string[];
  bodyFields: string[];
  multipart: boolean;
  statuses: number[];
  requiresAuth: boolean;
  adminOnly: boolean;
  binaryResponse: boolean;
};

// Routers declared with a relative path and mounted by prefix.
const ROUTER_PREFIX: Record<string, string> = {
  "payments/routes.ts": "/api/payment-requests",
  "whatsapp/routes.ts": "/api/admin/whatsapp",
};

const ROUTE_RE = /\b(app|router)\.(get|post|put|patch|delete)\(\s*(["'`])(\/[^"'`]*)\3/g;

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function destructured(block: string, source: string): string[] {
  const names: string[] = [];
  const re = new RegExp(`const\\s*\\{([^}]*)\\}\\s*=\\s*\\(?${source}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    for (const part of m[1].split(",")) {
      const name = part.split(":")[0].split("=")[0].replace(/[.\s]/g, "");
      if (/^[A-Za-z_]\w*$/.test(name)) names.push(name);
    }
  }
  return names;
}

function fieldsOf(block: string, source: string): string[] {
  const direct: string[] = [];
  const re = new RegExp(`${source.replace(".", "\\.")}\\??\\.([A-Za-z_]\\w*)`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) direct.push(m[1]);
  return unique([...direct, ...destructured(block, source.replace(".", "\\."))]);
}

export function scanRoutes(srcRoot: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  for (const file of listSourceFiles(srcRoot)) {
    const rel = relative(srcRoot, file).replace(/\\/g, "/");
    const src = readFileSync(file, "utf8");
    const prefix = ROUTER_PREFIX[rel] ?? "";
    const hits: { index: number; method: ScannedRoute["method"]; path: string; prefixed: boolean }[] = [];
    let m: RegExpExecArray | null;
    ROUTE_RE.lastIndex = 0;
    while ((m = ROUTE_RE.exec(src))) {
      const prefixed = m[1] === "router" && prefix !== "";
      hits.push({ index: m.index, method: m[2] as ScannedRoute["method"], prefixed, path: prefixed ? prefix + (m[4] === "/" ? "" : m[4]) : m[4] });
    }
    hits.forEach((hit, i) => {
      const full = hit.path;
      if (!/^\/(api|auth|share-target)/.test(full)) return;
      const block = src.slice(hit.index, hits[i + 1]?.index ?? src.length);
      const head = block.slice(0, 600);
      const statuses = unique([...block.matchAll(/res\.status\((\d{3})\)/g)].map((x) => x[1])).map(Number);
      routes.push({
        method: hit.method,
        path: full,
        openapiPath: full.replace(/:([A-Za-z_]\w*)/g, "{$1}"),
        file: rel,
        pathParams: [...full.matchAll(/:([A-Za-z_]\w*)/g)].map((x) => x[1]),
        queryParams: fieldsOf(block, "req.query"),
        bodyFields: fieldsOf(block, "req.body"),
        multipart: /upload(?:er)?\.(?:single|array|fields)\(|multer\(/.test(head),
        statuses,
        requiresAuth: /requireAuth\(/.test(block) || /res\.locals\.auth/.test(block) || prefix !== "",
        adminOnly: /requireRole\([^)]*["']admin["']|requireAdmin/.test(block) || rel === "routes/admin.ts" || rel === "routes/adminCampaigns.ts" || rel === "whatsapp/routes.ts",
        binaryResponse: /res\.(?:download|sendFile)\(|application\/pdf|application\/vnd|text\/csv|image\//.test(block),
      });
    });
  }
  return routes;
}
