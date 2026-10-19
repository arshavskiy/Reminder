import {beforeEach, expect, it, vi} from "vitest";
import {ObjectId} from "mongodb";
vi.mock("../db/db", async () => await import("./helpers/memoryDb"));
import {memory} from "./helpers/memoryDb";
import {findSuccessfullyImportedMessageIds, findHandledInlineMessageIds} from "../routes/gmail";

beforeEach(() => memory.clear());

it("excludes saved, superseded and rejected inline messages, but keeps transient failures and other users' messages", async () => {
  memory.set("invoices", [
    {user_id: "u", source: "gmail_inline", gmail_message_id: "saved", superseded_gmail_message_ids: ["older"]},
    {user_id: "other", source: "gmail_inline", gmail_message_id: "other-user"},
  ]);
  memory.set("gmail_imports", [
    {user_id: "u", message_id: "rejected", files: [{error: "not_a_recognized_inline_receipt"}]},
    {user_id: "u", message_id: "retry", files: [{error: "network error"}]},
  ]);
  const ids = ["saved", "older", "rejected", "retry", "other-user", "new"];
  const handled = await findHandledInlineMessageIds("u", ids);
  expect(ids.filter(id => !handled.has(id))).toEqual(["retry", "other-user", "new"]);
});

it("does not redownload a stored rejected document during a normal scan", async () => {
  const id = new ObjectId();
  memory.set("gmail_imports", [{user_id: "u", message_id: "m", files: [{document_id: String(id), error: null}]}]);
  memory.set("documents", [{_id: id, user_id: "u", processing_status: "done", invoice_rejected: true}]);
  expect(await findSuccessfullyImportedMessageIds("u", ["m"])).toEqual(new Set(["m"]));
});

it("keeps partially failed messages eligible for retry", async () => {
  const id = new ObjectId();
  memory.set("gmail_imports", [{user_id: "u", message_id: "m", files: [{document_id: String(id)}, {error: "download failed"}]}]);
  memory.set("documents", [{_id: id, user_id: "u", processing_status: "done"}]);
  expect(await findSuccessfullyImportedMessageIds("u", ["m"])).toEqual(new Set());
});
