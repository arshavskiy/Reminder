import {describe, expect, it} from "vitest";
import {
    generatedPdfCollapseKey,
    generatedPdfReplaceQuery,
    groupGeneratedPdfsToCollapse,
    normalizeReportNumber,
    pickGeneratedPdfToKeep,
} from "../documents/generatedPdfReplace.js";

describe("generatedPdfReplaceQuery", () => {
    it("matches by contract id and report number", () => {
        expect(generatedPdfReplaceQuery("u1", {
            contractId: "c1",
            reportNumber: "310018668/19011",
        })).toEqual({
            user_id: "u1",
            $and: [
                {
                    $or: [
                        {document_kind: "generated_print_template_pdf"},
                        {document_source: "generated"},
                    ],
                },
                {
                    $or: [
                        {contract_id: "c1"},
                        {"extracted_fields.report_number": "310018668/19011"},
                        {"extracted_fields.contract_number": "310018668/19011"},
                        {"extracted_fields.document_number": "310018668/19011"},
                        {"extracted_fields.report_number": "310018668-19011"},
                        {"extracted_fields.contract_number": "310018668-19011"},
                        {"extracted_fields.document_number": "310018668-19011"},
                        {file_name: {$regex: "310018668-19011(?:\\.pdf)?$", $options: "i"}},
                    ],
                },
            ],
        });
    });

    it("returns null when there is nothing to match", () => {
        expect(generatedPdfReplaceQuery("u1", {})).toBeNull();
    });

    it("does not use a filename regex for an inspector number without a report suffix", () => {
        const query = generatedPdfReplaceQuery("u1", {reportNumber: "310018668"});
        expect(JSON.stringify(query)).not.toContain("file_name");
    });
});

describe("generatedPdfCollapseKey", () => {
    it("groups hyphenated filenames with slash report numbers", () => {
        const withSlash = generatedPdfCollapseKey({
            user_id: "u1",
            extracted_fields: {report_number: "310018668/19011"},
        });
        const withHyphen = generatedPdfCollapseKey({
            user_id: "u1",
            extracted_fields: {contract_number: "310018668-19011"},
        });
        expect(withSlash).toBe(withHyphen);
        expect(normalizeReportNumber("310018668-19011")).toBe("310018668/19011");
    });

    it("groups duplicate cards that only have the report number in the filename", () => {
        expect(generatedPdfCollapseKey({
            user_id: "u1",
            file_name: "תקופתית הנסון בע-מ pdf.310018668-20000",
        })).toBe(generatedPdfCollapseKey({
            user_id: "u1",
            extracted_fields: {report_number: "310018668/20000"},
        }));
    });

    it("keeps different report numbers in separate groups", () => {
        expect(generatedPdfCollapseKey({
            user_id: "u1",
            extracted_fields: {report_number: "310018668/20000"},
        })).not.toBe(generatedPdfCollapseKey({
            user_id: "u1",
            extracted_fields: {report_number: "310018668/19011"},
        }));
    });
});

describe("pickGeneratedPdfToKeep", () => {
    it("keeps the preferred linked document", () => {
        expect(pickGeneratedPdfToKeep(
            [
                {id: "old", created_at: "2026-01-01"},
                {id: "linked", created_at: "2026-02-01"},
                {id: "new", created_at: "2026-03-01"},
            ],
            "linked",
        )).toEqual({keepId: "linked", deleteIds: ["old", "new"]});
    });

    it("keeps the newest when nothing is linked", () => {
        expect(pickGeneratedPdfToKeep([
            {id: "old", updated_at: "2026-01-01"},
            {id: "new", updated_at: "2026-03-01"},
        ])).toEqual({keepId: "new", deleteIds: ["old"]});
    });
});

describe("groupGeneratedPdfsToCollapse", () => {
    it("collapses extra PDFs that share a report number", () => {
        const groups = groupGeneratedPdfsToCollapse([
            {id: "a", user_id: "u1", extracted_fields: {report_number: "310018668/19011"}, updated_at: "2026-01-01"},
            {id: "b", user_id: "u1", extracted_fields: {report_number: "310018668/19011"}, updated_at: "2026-04-01"},
            {id: "c", user_id: "u1", extracted_fields: {report_number: "other"}, updated_at: "2026-04-01"},
        ], ["a"]);
        expect(groups).toEqual([{keepId: "a", deleteIds: ["b"]}]);
    });
});
