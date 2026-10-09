import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ObjectId} from "mongodb";
import {existsSync} from "node:fs";

const mocks = vi.hoisted(() => ({
  update: vi.fn(), claim: vi.fn(), users: vi.fn(), download: vi.fn(), send: vi.fn(), importFile: vi.fn(),
  config: vi.fn(),
}));
vi.mock("../db/db", () => ({
  getPrimaryDb: () => ({collection: (name: string) => name === "users"
    ? {find: () => ({limit: () => ({toArray: mocks.users})})}
    : {updateOne: mocks.update, findOneAndUpdate: mocks.claim}}),
  runWithPrimaryDb: (fn: () => unknown) => fn(),
}));
vi.mock("../whatsapp/cloudApi", async original => ({
  ...await original<typeof import("../whatsapp/cloudApi")>(),
  downloadWhatsAppMedia: mocks.download, sendWhatsAppText: mocks.send, whatsappConfigStatus: mocks.config,
}));
vi.mock("../pipeline/importer.js", () => ({importFile: mocks.importFile}));
import {enqueueWhatsAppIntake, intakePhonePattern, processWhatsAppIntakeOnce} from "../whatsapp/intake";
import {WhatsAppApiError} from "../whatsapp/cloudApi";

const userId = new ObjectId();
const incoming = {id: "wamid.incoming", type: "document", timestamp: "1791500000", document: {id: "789", filename: "receipt.pdf"}};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
  mocks.config.mockReturnValue({enabled: true});
  mocks.users.mockResolvedValue([{_id: userId}]);
  mocks.update.mockResolvedValue({modifiedCount: 1});
  mocks.download.mockResolvedValue({buffer: Buffer.from("%PDF-test"), filename: "wa_789.pdf", mimeType: "application/pdf"});
  mocks.importFile.mockResolvedValue("document-id");
  mocks.send.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

function claimJob(overrides = {}) {
  mocks.claim.mockResolvedValue({_id: "inbox-id", user_id: String(userId), phone: "972586281637", mediaId: "789", attempts: 1, receivedAt: new Date(), ...overrides});
}

describe("WhatsApp incoming documents", () => {
  it.each(["058-628-1637", "+972 58 628 1637", "00972586281637", "972586281637"])("matches an existing formatted profile phone: %s", phone => {
    expect(intakePhonePattern("972586281637").test(phone)).toBe(true);
    expect(intakePhonePattern("972586281637").test(`${phone}0`)).toBe(false);
  });
  it("persists repeated webhook deliveries with the same insert-only identity", async () => {
    await enqueueWhatsAppIntake("972586281637", incoming);
    await enqueueWhatsAppIntake("972586281637", incoming);
    const [filter, update, options] = mocks.update.mock.calls[0];
    expect(mocks.update.mock.calls[1][0]).toEqual(filter);
    expect(update).toEqual({$setOnInsert: expect.objectContaining({user_id: String(userId), status: "queued", mediaId: "789"})});
    expect(options).toEqual({upsert: true});
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("propagates persistence failures so Meta can retry", async () => {
    mocks.update.mockRejectedValue(new Error("offline"));
    await expect(enqueueWhatsAppIntake("972586281637", incoming)).rejects.toThrow("offline");
  });
  it("ignores a concurrent duplicate insert", async () => {
    mocks.update.mockRejectedValue({code: 11000});
    await expect(enqueueWhatsAppIntake("972586281637", incoming)).resolves.toBeUndefined();
  });
  it("does not route documents to an ambiguous account", async () => {
    mocks.users.mockResolvedValue([{_id: userId}, {_id: new ObjectId()}]);
    await enqueueWhatsAppIntake("972586281637", incoming);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not persist intake while disabled", async () => {
    mocks.config.mockReturnValue({enabled: false});
    await enqueueWhatsAppIntake("972586281637", incoming);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("imports a claimed job and removes its temporary file", async () => {
    claimJob();
    await processWhatsAppIntakeOnce();
    expect(mocks.importFile).toHaveBeenCalledWith(expect.any(String), undefined, String(userId), "wa_789.pdf", expect.objectContaining({queueProcessing: true, skipQuotaCheck: false}));
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({$set: expect.objectContaining({status: "completed", documentId: "document-id"})}));
    expect(existsSync(mocks.importFile.mock.calls[0][0])).toBe(false);
  });
  it("rechecks account routing before downloading", async () => {
    claimJob(); mocks.users.mockResolvedValue([]);
    await processWhatsAppIntakeOnce();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), {$set: {status: "cancelled", error: "intake_account_changed"}});
  });
  it("retries transient failures but stops after five attempts", async () => {
    claimJob(); mocks.download.mockRejectedValue(new Error("timeout"));
    await processWhatsAppIntakeOnce();
    expect(mocks.update).toHaveBeenLastCalledWith(expect.anything(), {$set: expect.objectContaining({status: "queued"})});
    claimJob({attempts: 5});
    await processWhatsAppIntakeOnce();
    expect(mocks.update).toHaveBeenLastCalledWith(expect.anything(), {$set: expect.objectContaining({status: "failed"})});
  });
  it("does not retry unsupported media", async () => {
    claimJob(); mocks.download.mockRejectedValue(new WhatsAppApiError("unsupported_media_type"));
    await processWhatsAppIntakeOnce();
    expect(mocks.update).toHaveBeenLastCalledWith(expect.anything(), {$set: expect.objectContaining({status: "failed", error: "unsupported_media_type"})});
  });
  it("does not retry an imported document when its confirmation fails", async () => {
    claimJob(); mocks.send.mockRejectedValue(new Error("timeout"));
    await processWhatsAppIntakeOnce();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({$set: expect.objectContaining({status: "completed"})}));
  });
  it("skips free-text confirmations for old messages", async () => {
    claimJob({receivedAt: new Date(Date.now() - 25 * 3600000)});
    await processWhatsAppIntakeOnce();
    expect(mocks.importFile).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
