import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ObjectId} from "mongodb";
import express from "express";
import type {Server} from "node:http";
import {calculateCharges, formatBillingDocumentNumber, renderPaymentRequestHtml, validateRates} from "../payments/pricing";

const mocks = vi.hoisted(() => ({auth: vi.fn(), collections: {} as Record<string, any>, send: vi.fn()}));
vi.mock("../db/db", () => ({col: (name: string) => mocks.collections[name]}));
vi.mock("../auth/middleware", () => ({requireAuth: mocks.auth, HTTPException: class extends Error {constructor(public status: number, message: string) {super(message);}}}));
vi.mock("../routes/printTemplates", () => ({renderHtmlPdf: vi.fn()}));
vi.mock("../storage/spaces", () => ({spacesEnabled: () => false, uploadToSpaces: vi.fn(), deleteFromSpaces: vi.fn()}));
vi.mock("../storage/gdrive", () => ({syncDocumentToDrive: vi.fn(), resolveDriveToken: vi.fn(), trashDriveFile: vi.fn()}));
vi.mock("../documents/fileResolver", () => ({resolveDocumentFilePath: vi.fn()}));
vi.mock("../reminders/emailSender", () => ({sendEmailWithAttachments: mocks.send}));
vi.mock("../contracts/contractEmail", () => ({parseObjectRecord: (value: unknown) => value || {}}));
import {registerPaymentRoutes} from "../payments/routes";

const rates = [{id: "lifting-visual", reportType: "מכונות הרמה", section: "בדיקה חזותית", label: "בדיקה חזותית למכונה", unitCents: 12550}, {id: "pressure", reportType: "כלי לחץ", section: "בדיקת לחץ", label: "בדיקת לחץ", unitCents: 40000}];
describe("inspection pricing", () => {
  it("numbers each user's quotes from 001 without an annual prefix", () => {
    expect(formatBillingDocumentNumber("quote", 1, 2026)).toBe("001");
    expect(formatBillingDocumentNumber("quote", 27, 2027)).toBe("027");
    expect(formatBillingDocumentNumber("payment_request", 1, 2026)).toBe("PAY-2026-00001");
  });

  it("calculates integer cents and keeps an immutable price snapshot", () => {
    const source = rates.map(rate => ({...rate}));
    const charge = calculateCharges(source, "מכונות הרמה", [{rateId: "lifting-visual", quantity: 3}], 1800);
    expect(charge).toMatchObject({subtotalCents: 37650, vatCents: 6777, totalCents: 44427});
    source[0].unitCents = 999;
    expect(charge.lines[0].unitCents).toBe(12550);
  });
  it("rejects sections for another inspection type and duplicate charges", () => {
    expect(() => calculateCharges(rates, "מכונות הרמה", [{rateId: "pressure", quantity: 1}], 0)).toThrow();
    expect(() => calculateCharges(rates, "מכונות הרמה", [{rateId: "lifting-visual", quantity: 1}, {rateId: "lifting-visual", quantity: 1}], 0)).toThrow();
  });
  it.each([0, -1, 1.5, NaN, 10001])("rejects quantity %s", quantity => {
    expect(() => calculateCharges(rates, "מכונות הרמה", [{rateId: "lifting-visual", quantity}], 0)).toThrow();
  });
  it("requires explicit tax and rejects invalid pricebook values", () => {
    expect(() => calculateCharges(rates, "מכונות הרמה", [{rateId: "lifting-visual", quantity: 1}], undefined)).toThrow();
    expect(() => validateRates([{...rates[0], unitCents: -1}])).toThrow();
    expect(() => validateRates([rates[0], rates[0]])).toThrow();
    expect(validateRates(rates)).toEqual(rates);
  });
  it("escapes customer text in the RTL payment request PDF source", () => {
    const html = renderPaymentRequestHtml({number: "PAY-1", createdAt: new Date(), dueDate: "2026-10-01", issuer: {name: "בודק"}, customer: {name: '<img src="https://bad.example">'}, reportNumber: "123", reportType: "מכונות הרמה", notes: "<script>bad</script>", ...calculateCharges(rates, "מכונות הרמה", [{rateId: "lifting-visual", quantity: 1}], 0)});
    expect(html).toContain('dir="rtl"');
    expect(html).not.toContain('<img src="https://bad.example">');
    expect(html).not.toContain("<script>");
    expect(html).toContain("אינו חשבונית מס או קבלה");
    expect(html).toContain("סה״כ הצעה");
    expect(html).toContain("חתימה וחותמת");
    expect(html).toContain("summary-cards");
    expect(html).not.toContain("footer-mark");
    expect(html).toContain("מסמך ממוחשב הופק ע״י");
    expect(html).toContain("handcoded.tech");
    expect(html).not.toContain("<div class=\"notes\">");
  });
  it("shows only a safe user-uploaded logo in the quote header", () => {
    const base = {documentKind: "quote", number: "001", createdAt: new Date(), dueDate: "2026-10-01", issuer: {}, customer: {}, lines: [], subtotalCents: 0, vatBasisPoints: 0, vatCents: 0, totalCents: 0};
    expect(renderPaymentRequestHtml(base)).not.toContain('alt="לוגו העסק"');
    expect(renderPaymentRequestHtml({...base, issuer: {logoUrl: "https://cdn.example/logo.png"}})).toContain('src="https://cdn.example/logo.png" alt="לוגו העסק"');
    expect(renderPaymentRequestHtml({...base, issuer: {logoUrl: "javascript:alert(1)"}})).not.toContain('alt="לוגו העסק"');
  });
  it.each([
    ["quote", "הצעת מחיר"],
    ["payment_request", "דרישת תשלום"],
    ["service_specification", "מפרט תשלום עבור שירות"],
  ])("renders %s as a clearly non-accounting document", (documentKind, title) => {
    const html = renderPaymentRequestHtml({documentKind, number: "TEST-1", createdAt: new Date(), dueDate: "2026-10-01", issuer: {}, customer: {}, lines: [], subtotalCents: 0, vatBasisPoints: 0, vatCents: 0, totalCents: 0});
    expect(html).toContain(`<h1>${title} TEST-1</h1>`);
    expect(html).toContain("אינו חשבונית מס או קבלה");
  });
});

let server: Server | undefined;
const userId = new ObjectId().toString();
const requestId = new ObjectId();
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({userId});
  for (const name of ["payment_requests", "inspection_pricebooks", "contracts", "engineer_profiles", "users", "clients", "documents", "document_clients"]) {
    mocks.collections[name] = {findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), insertOne: vi.fn(), deleteOne: vi.fn(), deleteMany: vi.fn()};
  }
});
afterEach(async () => { if (server) await new Promise<void>(resolve => {server!.close(() => resolve());server!.closeAllConnections();}); server=undefined; });
async function endpoint() {
  const app=express();app.use(express.json());registerPaymentRoutes(app);server=app.listen(0,"127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));const address=server.address();
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/api/payment-requests`;
}
const body = {amountCents: 1000, paymentKey: "12345678-1234-1234-1234-123456789abc", method: "bank_transfer", reference: "ref-1", paidDate: "2026-09-09"};
describe("payment request authorization and settlement", () => {
  it("prices automatic equipment rows supplied with a quote", async () => {
    const contractId = new ObjectId();
    mocks.collections.contracts.findOne.mockResolvedValue({
      _id: contractId,
      user_id: userId,
      contract_number: "123/45",
      contract_type: "מכונות הרמה",
      counterparty: "לקוח",
      manual_fields: {},
    });
    mocks.collections.inspection_pricebooks.findOne.mockResolvedValue({rates: []});
    mocks.collections.payment_requests.findOne.mockResolvedValue(null);
    const url = await endpoint();
    const response = await fetch(`${url}/requests`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        requestKey: "12345678-1234-1234-1234-123456789abc",
        documentKind: "quote",
        contractId: contractId.toString(),
        inlineRates: [{id: "equipment-row-1", reportType: "מכונות הרמה", section: "1", label: "בדיקת מלגזה · מס׳ זיהוי: 123", unitCents: 45000}],
        lines: [{rateId: "equipment-row-1", quantity: 2}],
        vatBasisPoints: 1800,
        dueDate: "2026-09-23",
        notes: "",
      }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({subtotalCents: 90000, vatCents: 16200, totalCents: 106200});
  });

  it("does not resend a completed email and rejects a changed recipient", async () => {
    const sendId = body.paymentKey;
    mocks.collections.payment_requests.findOne.mockResolvedValue({_id: requestId, status: "issued", documentId: new ObjectId().toString(), sendId, sendState: "sent", lastSentTo: "customer@example.com"});
    const url = await endpoint();
    const send = (email: string) => fetch(`${url}/requests/${requestId}/send`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({sendId, email})});
    expect((await send("customer@example.com")).status).toBe(200);
    expect((await send("another@example.com")).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated access", async () => {
    mocks.auth.mockRejectedValue(new Error("no auth"));const url=await endpoint();
    expect((await fetch(`${url}/`)).status).toBe(401);
  });
  it("scopes requests to their owner", async () => {
    mocks.collections.payment_requests.findOne.mockResolvedValue(null);const url=await endpoint();
    expect((await fetch(`${url}/requests/${requestId}/pdf`)).status).toBe(404);
    expect(mocks.collections.payment_requests.findOne).toHaveBeenCalledWith({_id:requestId,user_id:userId});
  });
  it("returns a single owned quote", async () => {
    mocks.collections.payment_requests.findOne.mockResolvedValue({_id: requestId, user_id: userId, documentKind: "quote", number: "001"});
    const url = await endpoint();
    const response = await fetch(`${url}/requests/${requestId}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({number: "001", documentKind: "quote"});
  });
  it("deletes a quote and its generated document", async () => {
    const documentId = new ObjectId();
    mocks.collections.payment_requests.findOne.mockResolvedValue({_id: requestId, user_id: userId, documentId: documentId.toString()});
    mocks.collections.documents.findOne.mockResolvedValue({_id: documentId, user_id: userId});
    const url = await endpoint();
    const response = await fetch(`${url}/requests/${requestId}`, {method: "DELETE"});
    expect(response.status).toBe(200);
    expect(mocks.collections.payment_requests.deleteOne).toHaveBeenCalledWith({_id: requestId, user_id: userId});
    expect(mocks.collections.documents.deleteOne).toHaveBeenCalledWith({_id: documentId, user_id: userId});
  });
  it("records payments atomically with balance and duplicate guards", async () => {
    mocks.collections.payment_requests.findOne.mockResolvedValue({_id:requestId,payments:[]});
    mocks.collections.payment_requests.findOneAndUpdate.mockResolvedValue({_id:requestId,paidCents:1000});
    const url=await endpoint();
    const response=await fetch(`${url}/requests/${requestId}/payments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    expect(response.status).toBe(200);
    expect(mocks.collections.payment_requests.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({user_id:userId,status:"issued","payments.paymentKey":{$ne:body.paymentKey},$expr:{$lte:[{$add:["$paidCents",1000]},"$totalCents"]}}),expect.objectContaining({$inc:{paidCents:1000}}),{returnDocument:"after"});
  });
  it("returns an existing identical payment without applying it twice", async () => {
    mocks.collections.payment_requests.findOne.mockResolvedValue({_id:requestId,payments:[body]});const url=await endpoint();
    expect((await fetch(`${url}/requests/${requestId}/payments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).status).toBe(200);
    expect(mocks.collections.payment_requests.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("rejects an overpayment and invalid calendar date", async () => {
    mocks.collections.payment_requests.findOne.mockResolvedValue({_id:requestId,payments:[]});
    mocks.collections.payment_requests.findOneAndUpdate.mockResolvedValue(null);const url=await endpoint();
    const post=(payload:unknown)=>fetch(`${url}/requests/${requestId}/payments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    expect((await post(body)).status).toBe(409);
    expect((await post({...body,paidDate:"2026-02-31"})).status).toBe(400);
  });
});
