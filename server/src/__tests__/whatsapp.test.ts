import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {createHmac} from "node:crypto";
import {ObjectId} from "mongodb";
import express from "express";
import type {Server} from "node:http";
import {normalizeWhatsAppPhone, supportedTemplate, verifyWhatsAppSignature, sendWhatsAppTemplate, WhatsAppApiError, whatsappConfigStatus} from "../whatsapp/cloudApi";

const mocks = vi.hoisted(() => ({collections: {} as Record<string, any>, auth: vi.fn(), leads: vi.fn()}));
vi.mock("../db/db", () => ({getPrimaryDb: () => ({collection: (name: string) => mocks.collections[name]}), runWithPrimaryDb: (fn: () => unknown) => fn()}));
vi.mock("../routes/admin", () => ({inspectorLeadsCollection: () => mocks.leads()}));
vi.mock("../auth/middleware", async importOriginal => {
  const actual = await importOriginal<typeof import("../auth/middleware")>();
  return {...actual, requireAuth: mocks.auth};
});
import {handleWhatsAppWebhook, registerWhatsAppRoutes, registerWhatsAppWebhook} from "../whatsapp/routes";
import {processWhatsAppQueueOnce} from "../whatsapp/queue";

let server: Server | undefined;
const nativeFetch = globalThis.fetch;
beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({WHATSAPP_ACCESS_TOKEN: "test-secret", WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_BUSINESS_ACCOUNT_ID: "456", WHATSAPP_API_VERSION: "v23.0", WHATSAPP_VERIFY_TOKEN: "verify", WHATSAPP_APP_SECRET: "app-secret", WHATSAPP_ENABLED: "true"})) vi.stubEnv(key, value);
  for (const name of ["contacts", "campaigns", "messages", "control"]) {
    mocks.collections[`whatsapp_${name}`] = {findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}), countDocuments: vi.fn().mockResolvedValue(0), find: vi.fn()};
  }
  mocks.auth.mockResolvedValue({realUserId: "admin", userId: "admin", user: {role: "admin"}});
});
afterEach(async () => {
  if (server) await new Promise<void>(resolve => { server!.close(() => resolve()); server!.closeAllConnections(); });
  server = undefined;
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

async function appUrl() {
  const app = express();
  registerWhatsAppWebhook(app);
  app.use(express.json());
  registerWhatsAppRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const address = server.address();
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
}

describe("WhatsApp Cloud API", () => {
  it.each([["058-628-1637", "972586281637"], ["+972 58 628 1637", "972586281637"], ["00972586281637", "972586281637"], ["+1 (202) 555-0123", "12025550123"], ["0586281637 / 0501234567", null], ["hello", null], ["972+586281637", null]])("normalizes %s", (input, result) => {
    expect(normalizeWhatsAppPhone(input)).toBe(result);
  });
  it("accepts approved positional text templates and excludes unsupported components", () => {
    const base = {name: "intro", language: "he", status: "APPROVED", components: [{type: "BODY", text: "שלום {{1}}, {{2}}"}]};
    expect(supportedTemplate(base)?.parameters).toBe(2);
    expect(supportedTemplate({...base, status: "PENDING"})).toBeNull();
    expect(supportedTemplate({...base, components: [...base.components, {type: "BUTTONS"}]})).toBeNull();
    expect(supportedTemplate({...base, components: [{type: "BODY", text: "{{name}}"}]})).toBeNull();
    expect(supportedTemplate({...base, components: [{type: "BODY", text: "{{2}}"}]})).toBeNull();
  });
  it("verifies exact raw bytes with a constant-time HMAC comparison", () => {
    const body = Buffer.from('{"hello":"שלום"}');
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifyWhatsAppSignature(body, signature, "secret")).toBe(true);
    expect(verifyWhatsAppSignature(Buffer.from("{}"), signature, "secret")).toBe(false);
    expect(verifyWhatsAppSignature(body, "invalid", "secret")).toBe(false);
  });
  it("sends template parameters and a correlation id without exposing tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({messages: [{id: "wamid.1"}]})));
    vi.stubGlobal("fetch", fetchMock);
    const template = {name: "intro", language: "he", body: "שלום {{1}}", parameters: 1};
    expect(await sendWhatsAppTemplate({phone: "972586281637", template, parameters: ["פבל"], callback: "job-1"})).toBe("wamid.1");
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toMatchObject({type: "template", biz_opaque_callback_data: "job-1", template: {components: [{type: "body", parameters: [{type: "text", text: "פבל"}]}]}});
  });
  it("does not send when disabled", async () => {
    vi.stubEnv("WHATSAPP_ENABLED", "false");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(whatsappConfigStatus().enabled).toBe(false);
    await expect(sendWhatsAppTemplate({phone: "972586281637", template: {name: "hello", language: "he", body: "hello", parameters: 0}, parameters: [], callback: "1"})).rejects.toThrow("whatsapp_disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("WhatsApp routes and webhooks", () => {
  it("previews only opted-in unique phones and queues an unchanged preview once", async () => {
    const url = await appUrl();
    const ids = Array.from({length: 3}, () => new ObjectId());
    const leads = [{_id: ids[0], name: "פבל", phone: "0586281637"}, {_id: ids[1], name: "Duplicate", phone: "+972586281637"}, {_id: ids[2], name: "No consent", phone: "0501234567"}];
    mocks.leads.mockResolvedValue({find: () => ({toArray: async () => leads})});
    mocks.collections.whatsapp_contacts.findOne.mockImplementation(async ({phone}: {phone: string}) => phone === "972586281637" ? {optedIn: true} : null);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({data: [{name: "intro", language: "he", status: "APPROVED", components: [{type: "BODY", text: "שלום {{1}}"}]}]}))));
    const draft = {leadIds: ids.map(id => id.toString()), templateName: "intro", language: "he", parameters: ["{{name}}"]};
    const post = (path: string, body: unknown) => nativeFetch(`${url}/api/admin/whatsapp/${path}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
    const response = await post("preview", draft);
    expect(response.status).toBe(200);
    const preview = await response.json();
    expect(preview.recipients).toEqual([{phone: "972586281637", name: "פבל", parameters: ["פבל"]}]);
    expect(preview.skipped).toBe(2);
    const requestId = "12345678-1234-1234-1234-123456789abc";
    expect((await post("campaigns", {...draft, requestId, previewHash: "stale"})).status).toBe(409);
    mocks.collections.whatsapp_campaigns.insertOne = vi.fn().mockResolvedValue({});
    mocks.collections.whatsapp_messages.insertMany = vi.fn().mockResolvedValue({});
    const queued = await post("campaigns", {...draft, requestId, previewHash: preview.previewHash});
    expect(queued.status).toBe(201);
    expect(mocks.collections.whatsapp_messages.insertMany.mock.calls[0][0]).toHaveLength(1);
    const persisted = mocks.collections.whatsapp_campaigns.insertOne.mock.calls[0][0];
    mocks.collections.whatsapp_campaigns.findOne.mockResolvedValue({...persisted, status: "queued"});
    expect((await post("campaigns", {...draft, requestId, previewHash: preview.previewHash})).status).toBe(200);
    expect(mocks.collections.whatsapp_campaigns.insertOne).toHaveBeenCalledTimes(1);
  });
  it("requires admin role for consent changes", async () => {
    mocks.auth.mockResolvedValue({user: {role: "user"}});
    const url = await appUrl();
    const result = await fetch(`${url}/api/admin/whatsapp/consent`, {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify({phone: "0586281637", optedIn: true, source: "request"})});
    expect(result.status).toBe(403);
    expect(mocks.collections.whatsapp_contacts.updateOne).not.toHaveBeenCalled();
  });
  it("requires consent evidence and cancels queued messages on revocation", async () => {
    const url = await appUrl();
    const put = (source: string) => fetch(`${url}/api/admin/whatsapp/consent`, {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify({phone: "0586281637", optedIn: false, source})});
    expect((await put("")).status).toBe(400);
    expect((await put("Recipient requested removal")).status).toBe(200);
    expect(mocks.collections.whatsapp_messages.updateMany).toHaveBeenCalledWith({phone: "972586281637", status: "queued"}, expect.anything());
  });
  it("supports verification and rejects unsigned or malformed webhook payloads", async () => {
    const url = await appUrl();
    const result = await fetch(`${url}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=12345`);
    expect(await result.text()).toBe("12345");
    expect((await fetch(`${url}/api/webhooks/whatsapp`, {method: "POST", headers: {"Content-Type": "application/json"}, body: "{}"})).status).toBe(401);
    const signature = `sha256=${createHmac("sha256", "app-secret").update("{").digest("hex")}`;
    expect((await fetch(`${url}/api/webhooks/whatsapp`, {method: "POST", headers: {"Content-Type": "application/json", "X-Hub-Signature-256": signature}, body: "{"})).status).toBe(400);
  });
  it("uses monotonic delivery updates and correlates early webhooks to queued jobs", async () => {
    const id = new ObjectId();
    await handleWhatsAppWebhook({object: "whatsapp_business_account", entry: [{id: "456", changes: [{value: {metadata: {phone_number_id: "123"}, statuses: [{id: "wamid.1", recipient_id: "972586281637", biz_opaque_callback_data: id.toString(), status: "read"}]}}]}]});
    expect(mocks.collections.whatsapp_messages.updateOne).toHaveBeenCalledWith({_id: id, phone: "972586281637", rank: {$lt: 6}}, expect.objectContaining({$set: expect.objectContaining({status: "read", rank: 6})}));
  });
  it("processes inbound STOP but ignores another sender's webhook", async () => {
    const payload = (sender: string) => ({object: "whatsapp_business_account", entry: [{id: "456", changes: [{value: {metadata: {phone_number_id: sender}, messages: [{from: "972586281637", text: {body: "הסר"}}]}}]}]});
    await handleWhatsAppWebhook(payload("wrong"));
    expect(mocks.collections.whatsapp_contacts.updateOne).not.toHaveBeenCalled();
    await handleWhatsAppWebhook(payload("123"));
    expect(mocks.collections.whatsapp_contacts.updateOne).toHaveBeenCalledWith({phone: "972586281637"}, {$set: expect.objectContaining({optedIn: false})}, {upsert: true});
  });
});

describe("WhatsApp durable queue", () => {
  function queuedJob(consent = true) {
    const id = new ObjectId();
    const campaignId = new ObjectId();
    mocks.collections.whatsapp_control.findOneAndUpdate.mockResolvedValue({_id: new ObjectId()});
    mocks.collections.whatsapp_campaigns.find.mockReturnValue({limit: () => ({toArray: async () => [{_id: campaignId}]})});
    mocks.collections.whatsapp_messages.findOneAndUpdate.mockResolvedValue({_id: id, campaignId, phone: "972586281637", parameters: [], attempts: 1});
    mocks.collections.whatsapp_contacts.findOne.mockResolvedValue(consent ? {optedIn: true} : null);
    mocks.collections.whatsapp_campaigns.findOne.mockResolvedValue({phoneNumberId: "123", template: {name: "intro", language: "he", parameters: 0}});
    return id;
  }
  it("rechecks consent immediately before sending", async () => {
    queuedJob(false);
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await processWhatsAppQueueOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.collections.whatsapp_messages.updateOne).toHaveBeenCalledWith(expect.anything(), {$set: expect.objectContaining({status: "cancelled"})});
  });
  it("does not send when another worker owns the lease", async () => {
    queuedJob(); mocks.collections.whatsapp_control.findOneAndUpdate.mockResolvedValue(null);
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await processWhatsAppQueueOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([[429, "queued"], [400, "failed"], [500, "unknown"]])("handles HTTP %s as %s", async (status, expected) => {
    queuedJob();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({error: {code: status}}), {status})));
    await processWhatsAppQueueOnce();
    expect(mocks.collections.whatsapp_messages.updateOne).toHaveBeenCalledWith(expect.anything(), {$set: expect.objectContaining({status: expected})});
  });
  it("does not retry a network timeout with an ambiguous result", async () => {
    queuedJob(); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await processWhatsAppQueueOnce();
    expect(mocks.collections.whatsapp_messages.updateOne).toHaveBeenCalledWith(expect.anything(), {$set: expect.objectContaining({status: "unknown"})});
  });
});
