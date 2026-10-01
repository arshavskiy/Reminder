// Adds an OpenAPI operation to docs/openapi.yaml for every Express route that is
// not documented yet. Existing entries are never touched, so hand-written detail
// survives. Run from the server directory: npx tsx scripts/openapiGenerate.ts
// The summaries come from openapiSummaries.ts; a route without one fails the run.
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parseDocument } from "yaml";
import { scanRoutes, type ScannedRoute } from "../src/docs/routeScan";
import { SUMMARIES } from "./openapiSummaries";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = join(ROOT, "..", "docs", "openapi.yaml");

const TAGS: [RegExp, string][] = [
  [/^\/api\/admin\/campaigns/, "Admin"],
  [/^\/api\/admin\/whatsapp/, "Admin"],
  [/^\/api\/admin/, "Admin"],
  [/^\/api\/webhooks|^\/api-docs/, "Webhooks"],
  [/^\/(api\/)?auth|^\/auth/, "Authentication"],
  [/^\/api\/(billing|features|config|settings)/, "Account"],
  [/^\/(api\/calendar|auth\/calendar)/, "Calendar"],
  [/^\/api\/clients/, "Clients"],
  [/^\/api\/contracts/, "Contracts"],
  [/^\/api\/documents/, "Documents"],
  [/^\/api\/(email-log|email\/)/, "Email"],
  [/^\/api\/equipment/, "Equipment"],
  [/^\/api\/extract/, "Reminders"],
  [/^\/api\/drive/, "Google Drive"],
  [/^\/(api\/gmail\/obligation)/, "Reminder Discovery"],
  [/^\/(api\/gmail|auth\/gmail)/, "Gmail"],
  [/^\/api\/inbound-email/, "Email-in"],
  [/^\/api\/invoices/, "Invoices"],
  [/^\/api\/(notifications|push)/, "Notifications"],
  [/^\/api\/payment-requests/, "Payment Requests"],
  [/^\/api\/print-templates/, "Print Templates"],
  [/^\/api\/(profile|user)/, "Profile"],
  [/^\/api\/reminders/, "Reminders"],
  [/^\/api\/(reports|search|tasks|activity)/, "Reports and Search"],
  [/^\/api\/(doc-templates|email-templates|assets)/, "Templates"],
];

const PUBLIC = new Set([
  "get /api-docs.json", "post /api/webhooks/resend", "get /api/webhooks/whatsapp", "post /api/webhooks/whatsapp",
  "get /auth/google", "get /auth/google/callback", "post /api/auth/google", "get /auth/magic", "get /auth/verify-email",
  "post /api/auth/forgot-password", "post /api/auth/reset-password", "get /api/calendar/feed/:file", "post /api/billing/tier",
  "get /api/config", "get /api/assets/:name",
]);

const ERROR_TEXT: Record<number, string> = {
  400: "Invalid input", 401: "Not signed in", 402: "Plan or quota limit reached", 403: "Not allowed",
  404: "Not found", 409: "Conflict", 413: "File too large", 429: "Too many requests", 500: "Server error", 503: "Not configured",
};

function tagFor(path: string): string {
  return TAGS.find(([re]) => re.test(path))?.[0] ? TAGS.find(([re]) => re.test(path))![1] : "Other";
}

function buildOperation(route: ScannedRoute): Record<string, unknown> {
  const key = `${route.method.toUpperCase()} ${route.path}`;
  const entry = SUMMARIES[key];
  if (!entry) throw new Error(`no summary for ${key}`);
  const [summary, description] = Array.isArray(entry) ? entry : [entry, undefined];
  const isPublic = PUBLIC.has(`${route.method} ${route.path}`);
  const op: Record<string, unknown> = { summary, tags: [tagFor(route.path)] };
  if (description) op.description = description;
  if (isPublic) op.security = [];
  else if (route.adminOnly) op.description = [description, "Admin only."].filter(Boolean).join("\n\n");

  const parameters: unknown[] = [
    ...route.pathParams.map((name) => ({ name, in: "path", required: true, schema: { type: "string" } })),
    ...route.queryParams.map((name) => ({ name, in: "query", required: false, schema: { type: "string" } })),
  ];
  if (parameters.length) op.parameters = parameters;

  if (route.multipart) {
    op.requestBody = {
      required: true,
      content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } } },
    };
  } else if (route.bodyFields.length && route.method !== "get") {
    op.requestBody = {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: Object.fromEntries(route.bodyFields.map((f) => [f, { description: "Read by the handler" }])),
          },
        },
      },
    };
  }

  const responses: Record<string, unknown> = {};
  const okStatus = route.statuses.find((s) => s >= 200 && s < 300);
  responses[String(okStatus ?? 200)] = route.binaryResponse
    ? { description: "File", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } }
    : { description: "Success", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } };
  for (const s of route.statuses) if (s >= 400 && s !== 401) responses[String(s)] = { description: ERROR_TEXT[s] ?? "Error" };
  if (!isPublic) responses["401"] = { description: ERROR_TEXT[401] };
  if (route.adminOnly && !responses["403"]) responses["403"] = { description: "Admin access required" };
  op.responses = responses;
  return op;
}

function main() {
  const doc = parseDocument(readFileSync(SPEC, "utf8"));
  const routes = scanRoutes(join(ROOT, "src"));
  let added = 0;
  for (const route of routes) {
    const existing = doc.getIn(["paths", route.openapiPath, route.method]);
    if (existing) continue;
    if (!doc.hasIn(["paths", route.openapiPath])) doc.setIn(["paths", route.openapiPath], doc.createNode({}));
    doc.setIn(["paths", route.openapiPath, route.method], doc.createNode(buildOperation(route)));
    added += 1;
  }
  writeFileSync(SPEC, String(doc));
  console.log(`added ${added} operations (${routes.length} routes scanned)`);
}

main();
