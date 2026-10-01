import { describe, expect, it, vi } from "vitest";
import {
  INBOUND_MAX_EMAILS_PER_DAY,
  handleInboundEmailEvent,
  inboundAddress,
  isAutoReply,
  isImportableAttachment,
  tokenFromRecipients,
  type InboundDeps,
  type InboundEmail,
} from "../inbound/inboundEmail";

const TOKEN = "a1b2c3d4e5f6a7b8c9d0";
const DOMAIN = "in.example.com";
const EVENT = { type: "email.received", data: { email_id: "em_1", to: [inboundAddress(TOKEN, DOMAIN)] } };

const baseEmail = (over: Partial<InboundEmail> = {}): InboundEmail => ({
  id: "em_1", from: "bill@vendor.com", to: [inboundAddress(TOKEN, DOMAIN)], subject: "Your bill",
  text: "hello", html: null, headers: null,
  attachments: [{ id: "att1", filename: "bill.pdf", size: 1000, content_type: "application/pdf" }],
  ...over,
});

function makeDeps(over: Partial<InboundDeps> = {}): InboundDeps {
  return {
    domain: DOMAIN,
    findUserByToken: vi.fn(async () => ({ userId: "u1", plan: "business", importAllowed: true })),
    claimEmail: vi.fn(async () => true),
    countToday: vi.fn(async () => 0),
    fetchEmail: vi.fn(async () => baseEmail()),
    downloadAttachment: vi.fn(async () => Buffer.from("pdf")),
    assertQuota: vi.fn(async () => undefined),
    isQuotaError: vi.fn((error: unknown) => error instanceof Error && error.message === "quota"),
    importDocument: vi.fn(async () => ({ id: "d1", duplicate: false })),
    saveDiscovery: vi.fn(async () => false),
    finish: vi.fn(async () => undefined),
    ...over,
  };
}

describe("tokenFromRecipients", () => {
  it("reads the token from a plain or display-name address", () => {
    expect(tokenFromRecipients([`RemindOCR <in+${TOKEN}@${DOMAIN}>`], DOMAIN)).toBe(TOKEN);
    expect(tokenFromRecipients([`IN+${TOKEN.toUpperCase()}@${DOMAIN.toUpperCase()}`], DOMAIN)).toBe(TOKEN);
  });

  it("rejects another domain or a malformed address", () => {
    expect(tokenFromRecipients([`in+${TOKEN}@other.com`], DOMAIN)).toBeNull();
    expect(tokenFromRecipients(["in+short@" + DOMAIN, "someone@" + DOMAIN], DOMAIN)).toBeNull();
  });
});

describe("isAutoReply", () => {
  it("flags auto-submitted and bulk mail but not normal mail", () => {
    expect(isAutoReply({ "Auto-Submitted": "auto-replied" })).toBe(true);
    expect(isAutoReply({ Precedence: "bulk" })).toBe(true);
    expect(isAutoReply({ "X-Autoreply": "yes" })).toBe(true);
    expect(isAutoReply({ "Auto-Submitted": "no" })).toBe(false);
    expect(isAutoReply(null)).toBe(false);
  });
});

describe("isImportableAttachment", () => {
  it("accepts documents and photos, rejects other types, inline images and oversize files", () => {
    expect(isImportableAttachment({ id: "1", filename: "a.PDF", size: 10, content_type: "" })).toBe(true);
    expect(isImportableAttachment({ id: "1", filename: "a.exe", size: 10, content_type: "" })).toBe(false);
    expect(isImportableAttachment({ id: "1", filename: "logo.png", size: 10, content_type: "", content_disposition: "inline", content_id: "cid" })).toBe(false);
    expect(isImportableAttachment({ id: "1", filename: "big.pdf", size: 30 * 1024 * 1024, content_type: "" })).toBe(false);
  });
});

describe("handleInboundEmailEvent", () => {
  it("ignores other events, a missing domain and unknown tokens", async () => {
    expect(await handleInboundEmailEvent({ type: "email.sent" }, makeDeps())).toMatchObject({ reason: "not_received_event" });
    expect(await handleInboundEmailEvent(EVENT, makeDeps({ domain: null }))).toMatchObject({ reason: "no_domain" });
    expect(await handleInboundEmailEvent(EVENT, makeDeps({ findUserByToken: vi.fn(async () => null) }))).toMatchObject({ reason: "unknown_token" });
  });

  it("imports allowed attachments and reports the counts", async () => {
    const deps = makeDeps({
      fetchEmail: vi.fn(async () => baseEmail({
        attachments: [
          { id: "a", filename: "bill.pdf", size: 10, content_type: "application/pdf" },
          { id: "b", filename: "notes.exe", size: 10, content_type: "" },
        ],
      })),
    });
    const result = await handleInboundEmailEvent(EVENT, deps);
    expect(result).toMatchObject({ status: "done", imported: 1, duplicates: 0, skipped: 1, quotaReached: false });
    expect(deps.importDocument).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a retried webhook", async () => {
    const deps = makeDeps({ claimEmail: vi.fn(async () => false) });
    expect(await handleInboundEmailEvent(EVENT, deps)).toEqual({ status: "duplicate" });
    expect(deps.fetchEmail).not.toHaveBeenCalled();
    expect(deps.importDocument).not.toHaveBeenCalled();
  });

  it("skips auto-replies without importing", async () => {
    const deps = makeDeps({ fetchEmail: vi.fn(async () => baseEmail({ headers: { "Auto-Submitted": "auto-generated" } })) });
    expect(await handleInboundEmailEvent(EVENT, deps)).toMatchObject({ status: "ignored", reason: "auto_reply" });
    expect(deps.importDocument).not.toHaveBeenCalled();
  });

  it("refuses a plan without document import and an over-limit day", async () => {
    const noPlan = makeDeps({ findUserByToken: vi.fn(async () => ({ userId: "u1", plan: "digital", importAllowed: false })) });
    expect(await handleInboundEmailEvent(EVENT, noPlan)).toMatchObject({ status: "refused", reason: "plan" });
    expect(noPlan.fetchEmail).not.toHaveBeenCalled();

    const busy = makeDeps({ countToday: vi.fn(async () => INBOUND_MAX_EMAILS_PER_DAY + 1) });
    expect(await handleInboundEmailEvent(EVENT, busy)).toMatchObject({ status: "refused", reason: "daily_limit" });
    expect(busy.importDocument).not.toHaveBeenCalled();
  });

  it("stops at the document quota and still reports what was imported", async () => {
    const assertQuota = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("quota"));
    const deps = makeDeps({
      assertQuota,
      fetchEmail: vi.fn(async () => baseEmail({
        attachments: [
          { id: "a", filename: "one.pdf", size: 10, content_type: "" },
          { id: "b", filename: "two.pdf", size: 10, content_type: "" },
        ],
      })),
    });
    expect(await handleInboundEmailEvent(EVENT, deps)).toMatchObject({ status: "done", imported: 1, quotaReached: true });
  });

  it("counts a file that was already stored as a duplicate and records a body deadline", async () => {
    const deps = makeDeps({
      importDocument: vi.fn(async () => ({ id: "d1", duplicate: true })),
      saveDiscovery: vi.fn(async () => true),
    });
    expect(await handleInboundEmailEvent(EVENT, deps)).toMatchObject({ imported: 0, duplicates: 1, discovery: true });
  });

  it("rethrows an unexpected error instead of hiding it", async () => {
    const deps = makeDeps({ importDocument: vi.fn(async () => { throw new Error("disk full"); }) });
    await expect(handleInboundEmailEvent(EVENT, deps)).rejects.toThrow("disk full");
  });
});
