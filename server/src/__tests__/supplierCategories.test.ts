import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { ObjectId } from "mongodb";
import type { Server } from "http";

const mocks = vi.hoisted(() => ({ signedIn: true }));

vi.mock("../auth/middleware", () => ({
  requireAuth: async () => {
    if (!mocks.signedIn) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    return { userId: "user-1", user: { plan: "business" } };
  },
  HTTPException: class extends Error {},
}));
vi.mock("../db/db", async () => await import("./helpers/memoryDb"));
vi.mock("../gmail/searchProviders", () => ({ loadGmailSearchProviders: async () => [] }));
vi.mock("../reminders/emailSender", () => ({ sendEmailWithAttachments: async () => undefined }));
vi.mock("../invoices/fxRates", () => ({ toIlsMany: async (rows: unknown[]) => rows }));

import { memory, rows } from "./helpers/memoryDb";
import { registerInvoiceRoutes } from "../routes/invoices";
import {getSupplierCategory} from "../invoices/supplierCategories";

let server: Server;
let base: string;
const call = (method: string, path: string, body?: unknown) => fetch(`${base}${path}`, {
  method,
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerInvoiceRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => { memory.clear(); mocks.signedIn = true; });

describe("supplier category rules", () => {
  it("updates existing invoices and remembers the category only for this user and supplier", async () => {
    rows("invoices").push(
      {_id: new ObjectId(), user_id: "user-1", supplier_name: "Acme"},
      {_id: new ObjectId(), user_id: "user-2", supplier_name: "Acme"},
    );
    const response = await call("POST", "/api/invoices/vendors/category", {supplierName: " Acme ", provider_category: "digital"});
    expect(response.status).toBe(200);
    expect(rows("invoices")[0].provider_category).toBe("digital");
    expect(rows("invoices")[1].provider_category).toBeUndefined();
    expect(await getSupplierCategory("user-1", "Acme")).toBe("digital");
    expect(await getSupplierCategory("user-2", "Acme")).toBeUndefined();
    expect(await getSupplierCategory("user-1", "Acme Ltd")).toBeUndefined();
  });

  it("replaces a rule without duplicates and removes it when the category is cleared", async () => {
    for (const category of ["digital", "general"]) {
      expect((await call("POST", "/api/invoices/vendors/category", {supplierName: "Acme", provider_category: category})).status).toBe(200);
    }
    expect(rows("supplier_category_rules")).toHaveLength(1);
    expect(await getSupplierCategory("user-1", "Acme")).toBe("general");
    expect((await call("POST", "/api/invoices/vendors/category", {supplierName: "Acme", provider_category: null})).status).toBe(200);
    expect(await getSupplierCategory("user-1", "Acme")).toBeUndefined();
  });

  it("rejects unauthorized and invalid rules", async () => {
    mocks.signedIn = false;
    expect((await call("POST", "/api/invoices/vendors/category", {supplierName: "Acme", provider_category: "digital"})).status).toBe(401);
    mocks.signedIn = true;
    expect((await call("POST", "/api/invoices/vendors/category", {supplierName: "Acme", provider_category: "invalid category!"})).status).toBe(400);
    expect(rows("supplier_category_rules")).toHaveLength(0);
    expect(await getSupplierCategory(undefined, "Acme")).toBeUndefined();
    expect(await getSupplierCategory("user-1", " ")).toBeUndefined();
  });
});
