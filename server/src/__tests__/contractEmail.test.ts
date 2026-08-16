import {describe, expect, it} from "vitest";
import {parseObjectRecord, pickContractEmail} from "../contracts/contractEmail.js";

describe("parseObjectRecord", () => {
    it("returns objects as-is so generated PDF fields are readable", () => {
        expect(parseObjectRecord({client_email: "a@x.com"})).toEqual({client_email: "a@x.com"});
    });

    it("parses JSON strings", () => {
        expect(parseObjectRecord('{"contact_email":"b@x.com"}')).toEqual({contact_email: "b@x.com"});
    });

    it("returns empty for invalid JSON", () => {
        expect(parseObjectRecord("[object Object]")).toEqual({});
    });
});

describe("pickContractEmail", () => {
    it("uses form email when the client record has none", () => {
        expect(pickContractEmail(
            {manual_fields: {contact_email: "form@x.com"}},
            {},
            {email: null},
        )).toBe("form@x.com");
    });

    it("reads client_email from compose fields stored as an object", () => {
        expect(pickContractEmail(
            {manual_fields: {}},
            {client_email: "layout@x.com"},
            {email: null},
        )).toBe("layout@x.com");
    });

    it("prefers contract form email over extracted fields", () => {
        expect(pickContractEmail(
            {manual_fields: {contact_email: "form@x.com", client_email: "form@x.com"}},
            {client_email: "", contact_email: "old@x.com"},
            {email: null},
        )).toBe("form@x.com");
    });

    it("parses stringified manual_fields", () => {
        expect(pickContractEmail(
            {manual_fields: '{"client_email":"sadad@asdsada.com"}'},
            {},
            {email: null},
        )).toBe("sadad@asdsada.com");
    });
});
