import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mocks = vi.hoisted(() => ({
  templates: [] as Array<Record<string, unknown>>,
  quotaError: false,
  quotaChecks: [] as unknown[][],
}));

vi.mock("../db/db", async () => await import("./helpers/memoryDb"));
vi.mock("../templates/seedTemplates", () => ({
  loadAllTemplates: async () => mocks.templates,
  loadTemplate: async () => null,
}));
vi.mock("../quotas/documentImportQuota", async (importOriginal) => {
  const original = await importOriginal<typeof import("../quotas/documentImportQuota")>();
  return {
    ...original,
    assertDocumentImportQuota: async (...args: unknown[]) => {
      mocks.quotaChecks.push(args);
      if (mocks.quotaError) throw new original.DocumentImportQuotaError({ code: "document_import_quota_exceeded" } as any);
    },
  };
});
vi.mock("../push/pushService", () => ({ sendToUser: async () => undefined }));

import { memory, rows } from "./helpers/memoryDb";
import { enqueueAutoInvoiceImport } from "../routes/gmail";

const userId = new ObjectId().toHexString();
// The real worker would claim and run the queued job; these tests only check what gets queued.
const noWorker = () => undefined;
const user = (over: Record<string, unknown> = {}) => ({
  _id: new ObjectId(userId),
  plan: "business",
  role: "user",
  gmail_access_token: "token",
  ...over,
});
const invoiceTemplate = { id: "tpl-1", name: "חשבונית", document_kind: "invoice" };

function seed(over: Record<string, unknown> = {}) {
  const row = user(over);
  memory.set("users", [row]);
  return row;
}

beforeEach(() => {
  memory.clear();
  mocks.templates = [invoiceTemplate];
  mocks.quotaError = false;
  mocks.quotaChecks = [];
});

describe("enqueueAutoInvoiceImport", () => {
  it("queues an automatic job limited to recent mail with the invoice template", async () => {
    const row = seed();
    const result = await enqueueAutoInvoiceImport(row, userId, noWorker);
    expect(result.ok).toBe(true);
    const jobs = rows("gmail_import_jobs");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ user_id: userId, status: "queued", source: "auto", template_id: "tpl-1" });
    expect(String(jobs[0].q)).toMatch(/newer_than:14d\b/);
    expect(String(jobs[0].q)).not.toMatch(/newer_than:\d+m/);
    // The quota is checked the same way the manual import does.
    expect(mocks.quotaChecks).toHaveLength(1);
  });

  it("refuses plans without Gmail invoice import", async () => {
    for (const plan of ["basic"]) {
      const row = seed({ plan });
      expect(await enqueueAutoInvoiceImport(row, userId, noWorker)).toEqual({ ok: false, reason: "plan" });
    }
    expect(rows("gmail_import_jobs")).toHaveLength(0);
  });

  it("queues for an admin, whose invoice history is unlimited rather than a number of months", async () => {
    const row = seed({ plan: "basic", role: "admin" });
    expect((await enqueueAutoInvoiceImport(row, userId, noWorker)).ok).toBe(true);
  });

  it("does nothing when Gmail is not connected", async () => {
    const row = seed({ gmail_access_token: undefined });
    expect(await enqueueAutoInvoiceImport(row, userId, noWorker)).toEqual({ ok: false, reason: "gmail_not_connected" });
    const revoked = seed({ gmail_scope_granted: false });
    expect(await enqueueAutoInvoiceImport(revoked, userId, noWorker)).toEqual({ ok: false, reason: "gmail_not_connected" });
  });

  it("does not pile up behind an import that is already queued or running", async () => {
    const row = seed();
    memory.set("gmail_import_jobs", [{ _id: new ObjectId(), user_id: userId, status: "running" }]);
    expect(await enqueueAutoInvoiceImport(row, userId, noWorker)).toEqual({ ok: false, reason: "already_running" });
    expect(rows("gmail_import_jobs")).toHaveLength(1);
  });

  it("needs an invoice template", async () => {
    const row = seed();
    mocks.templates = [{ id: "x", name: "תסקיר", document_kind: "inspection_report" }];
    expect(await enqueueAutoInvoiceImport(row, userId, noWorker)).toEqual({ ok: false, reason: "no_template" });
  });

  it("falls back to a template whose name says invoice, receipt or payment request", async () => {
    const row = seed();
    mocks.templates = [{ id: "r-1", name: "קבלה", document_kind: "receipt" }];
    expect((await enqueueAutoInvoiceImport(row, userId, noWorker)).ok).toBe(true);
    expect(rows("gmail_import_jobs")[0].template_id).toBe("r-1");
  });

  it("stops quietly when the import quota is used up", async () => {
    const row = seed();
    mocks.quotaError = true;
    expect(await enqueueAutoInvoiceImport(row, userId, noWorker)).toEqual({ ok: false, reason: "quota" });
    expect(rows("gmail_import_jobs")).toHaveLength(0);
  });
});
