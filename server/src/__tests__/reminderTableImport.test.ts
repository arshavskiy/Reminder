import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import express from "express";
import type {Server} from "http";
import {readFileSync} from "fs";
import {parseReminderTable} from "../imports/reminderTable";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), quota: vi.fn(), usage: vi.fn(),
  data: new Map<string, Map<string, Record<string, any>>>(),
}));
vi.mock("../auth/middleware", () => ({requireAuth: mocks.auth, HTTPException: class extends Error {constructor(public status: number, message: string) {super(message);}}}));
vi.mock("../db/db", () => ({col: (name: string) => {
  if (!mocks.data.has(name)) mocks.data.set(name, new Map());
  const collection = mocks.data.get(name)!;
  return {
    findOne: vi.fn(async (filter: any) => {
      if (filter._id !== undefined) {
        const row = collection.get(String(filter._id));
        return row && (filter.user_id === undefined || row.user_id === filter.user_id) ? row : null;
      }
      const keys = Object.keys(filter);
      return [...collection.values()].find(row => keys.every(k => row[k] === filter[k])) ?? null;
    }),
    updateOne: vi.fn(async (filter: any, update: any) => {
      if (collection.has(String(filter._id))) return {upsertedCount: 0};
      collection.set(String(filter._id), {...filter, ...update.$setOnInsert});
      return {upsertedCount: 1};
    }),
  };
}}));
vi.mock("../quotas/reminderQuota", () => ({
  assertReminderQuota: mocks.quota,
  ReminderQuotaError: class extends Error {}, reminderQuotaErrorPayload: () => ({error: "reminder_limit_reached"}),
}));
vi.mock("../quotas/userUsageCounters", () => ({incrementReminderUsage: mocks.usage}));
vi.mock("../templates/seedEmailTemplates", () => ({pickEmailTemplate: async () => ({id: "template"})}));
vi.mock("../logger", () => ({logger: {warn: vi.fn()}}));
import {registerReminderTableImportRoutes} from "../routes/reminderTableImport";
import {HTTPException} from "../auth/middleware";
import {ReminderQuotaError} from "../quotas/reminderQuota";

let server: Server;
let base: string;
const content = "Expiry Name,Expiry Date,External ID,Client Name,Client External ID,Reminder Advance Days\nRenewal,2027-01-15,E1,Demo,C1,30;0";
const send = async (action: string, text = content) => {
  const form = new FormData();
  form.append("file", new Blob([text]), "test.csv");
  return fetch(`${base}/api/reminders/table-import/${action}`, {method: "POST", body: form});
};
beforeAll(async () => {
  const app = express(); registerReminderTableImportRoutes(app);
  await new Promise<void>(resolve => {server = app.listen(0, "127.0.0.1", resolve);});
  base = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => {
  mocks.data.clear(); vi.clearAllMocks();
  mocks.auth.mockResolvedValue({userId: "tenant-a", user: {plan: "business"}, actingAs: null});
  mocks.quota.mockResolvedValue({}); mocks.usage.mockResolvedValue(undefined);
});
describe("table import API", () => {
  it("previews without writes and validates again on confirm", async () => {
    const response = await send("preview");
    expect(response.status).toBe(200);
    expect((await response.json()).newReminderCount).toBe(2);
    expect([...mocks.data.values()].every(c => c.size === 0)).toBe(true);
    const invalid = await send("confirm", content.replace("2027-01-15", "2027-02-30"));
    expect(invalid.status).toBe(400);
    expect([...mocks.data.values()].every(c => c.size === 0)).toBe(true);
  });
  it("creates linked records and skips repeated uploads", async () => {
    expect((await (await send("confirm")).json()).createdReminders).toBe(2);
    const client = [...mocks.data.get("clients")!.values()][0];
    const item = [...mocks.data.get("reminder_items")!.values()][0];
    const reminders = [...mocks.data.get("reminders")!.values()];
    expect(item.client_id).toBe(String(client._id));
    expect(item.name).toBe("Renewal");
    expect(item.expiry_date).toBe("2027-01-15");
    expect(reminders[0].source_id).toBe(String(item._id));
    expect(reminders.every(r => r.source_type === "table_import" && r.document_id === null)).toBe(true);
    expect(mocks.data.get("contracts")?.size ?? 0).toBe(0);
    expect(mocks.data.get("documents")?.size ?? 0).toBe(0);
    expect(reminders.map(r => r.trigger_date)).toEqual(["2026-12-16", "2027-01-15"]);
    expect(reminders.every(r => r.user_id === "tenant-a" && r.status === "pending")).toBe(true);
    expect((await (await send("confirm")).json()).createdReminders).toBe(0);
    expect(mocks.usage).toHaveBeenCalledTimes(2);
    expect(mocks.data.get("clients")!.size).toBe(1);
  });
  it("rejects changed content for an imported item key", async () => {
    await send("confirm");
    expect((await send("confirm", content.replace("2027-01-15", "2027-03-01"))).status).toBe(400);
    expect(mocks.data.get("reminders")!.size).toBe(2);
  });
  it("scopes IDs to the authenticated tenant", async () => {
    await send("confirm");
    mocks.auth.mockResolvedValue({userId: "tenant-b", user: {plan: "business"}});
    await send("confirm");
    expect(mocks.data.get("reminders")!.size).toBe(4);
    expect(mocks.data.get("clients")!.size).toBe(2);
  });
  it("checks authentication and effective account quota before writes", async () => {
    mocks.auth.mockRejectedValueOnce(new HTTPException(401, "Sign in"));
    expect((await send("preview")).status).toBe(401);
    mocks.auth.mockResolvedValue({userId: "acting-user", user: {plan: "business"}, actingAs: {plan: "expired"}});
    mocks.quota.mockRejectedValueOnce(new ReminderQuotaError({} as never));
    expect((await send("confirm")).status).toBe(403);
    expect(mocks.quota).toHaveBeenCalledWith("acting-user", "expired", 2);
    expect([...mocks.data.values()].every(c => c.size === 0)).toBe(true);
  });
  it("picks the email template bound to each row's category, ahead of the user default", async () => {
    mocks.data.set("email_templates", new Map([
      ["tpl-a", {_id: "tpl-a", reminder_category: "Software"}],
      ["tpl-b", {_id: "tpl-b", reminder_category: "Insurance"}],
    ]));
    mocks.data.set("user_settings", new Map([
      ["tenant-a", {user_id: "tenant-a", default_email_template_id: "user-default-tpl"}],
    ]));
    const twoCategoryContent = "Expiry Name,Expiry Date,External ID,Type,Reminder Advance Days\n"
      + "License,2027-01-15,E1,Software,0\n"
      + "Policy,2027-02-15,E2,Insurance,0\n"
      + "Misc,2027-03-15,E3,Unbound,0";
    await send("confirm", twoCategoryContent);
    const reminders = [...mocks.data.get("reminders")!.values()];
    const byTitle = Object.fromEntries(reminders.map(r => [r.title, r.email_template_id]));
    expect(byTitle["License"]).toBe("tpl-a");
    expect(byTitle["Policy"]).toBe("tpl-b");
    expect(byTitle["Misc"]).toBe("user-default-tpl");
  });
  it("ships equivalent 20-row English/Hebrew CSV and Excel examples", () => {
    const results = ["remindocr-import-20-en.csv", "remindocr-import-20-he.csv", "remindocr-import-20.xlsx"].map(name => parseReminderTable(readFileSync(new URL(`../../../client/src/public/templates/${name}`, import.meta.url)), name));
    for (const result of results) {
      expect(result.errors).toEqual([]);
      expect(result.rows).toHaveLength(20);
      expect(result.reminderCount).toBe(20);
      expect(new Set(result.rows.map(r => r.fields.clientId)).size).toBe(5);
    }
    expect(results[0].rows.map(r => [r.key, r.expiry])).toEqual(results[2].rows.map(r => [r.key, r.expiry]));
    expect(results[0].rows.map(r => r.fields)).toEqual(results[1].rows.map(r => r.fields));
    expect(results[0].rows.map(r => r.fields)).toEqual(results[2].rows.map(r => r.fields));
  });
});
