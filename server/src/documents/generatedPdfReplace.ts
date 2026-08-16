import {parseObjectRecord} from "../contracts/contractEmail.js";

export const GENERATED_PRINT_TEMPLATE_PDF = "generated_print_template_pdf";

export function reportNumberFromFields(fields: Record<string, unknown> | null | undefined): string | null {
    if (!fields) return null;
    for (const key of ["contract_number", "document_number", "report_number"] as const) {
        const value = fields[key];
        if (typeof value === "number" && Number.isFinite(value)) return String(value);
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
}

export function reportNumberFromFileName(fileName: unknown): string | null {
    if (typeof fileName !== "string") return null;
    const match = fileName.match(/(\d{5,})[/. -](\d{3,})/);
    return match ? `${match[1]}/${match[2]}` : null;
}

export function normalizeReportNumber(value: string): string {
    return value.trim().replace(/\s+/g, "").replace(/-/g, "/");
}

export function reportNumberVariants(value: string): string[] {
    const slash = normalizeReportNumber(value);
    const hyphen = slash.replace(/\//g, "-");
    return [...new Set([value.trim(), slash, hyphen].filter(Boolean))];
}

export function generatedPdfReplaceQuery(
    userId: string,
    opts: { contractId?: string | null; reportNumber?: string | null },
): Record<string, unknown> | null {
    const or: Record<string, unknown>[] = [];
    const contractId = opts.contractId?.trim() || null;
    const reportNumber = opts.reportNumber?.trim() || null;
    if (contractId) or.push({contract_id: contractId});
    if (reportNumber) {
        for (const variant of reportNumberVariants(reportNumber)) {
            or.push(
                {"extracted_fields.report_number": variant},
                {"extracted_fields.contract_number": variant},
                {"extracted_fields.document_number": variant},
            );
        }
        const hyphenated = normalizeReportNumber(reportNumber).replace(/\//g, "-");
        if (/^\d+-\d+$/.test(hyphenated)) {
            or.push({file_name: {$regex: `${escapeRegex(hyphenated)}(?:\\.pdf)?$`, $options: "i"}});
        }
    }
    if (!or.length) return null;
    return {
        user_id: userId,
        $and: [
            {
                $or: [
                    {document_kind: GENERATED_PRINT_TEMPLATE_PDF},
                    {document_source: "generated"},
                ],
            },
            {$or: or},
        ],
    };
}

export function generatedPdfCollapseKey(doc: {
    user_id?: unknown;
    contract_id?: unknown;
    extracted_fields?: unknown;
    file_name?: unknown;
}): string | null {
    const userId = typeof doc.user_id === "string" ? doc.user_id : "";
    if (!userId) return null;
    const fields = parseObjectRecord(doc.extracted_fields);
    const report = reportNumberFromFields(fields) ?? reportNumberFromFileName(doc.file_name);
    if (report) return `${userId}|report:${normalizeReportNumber(report)}`;
    const contractId = typeof doc.contract_id === "string" && doc.contract_id.trim()
        ? doc.contract_id.trim()
        : null;
    if (contractId) return `${userId}|contract:${contractId}`;
    return null;
}

export function pickGeneratedPdfToKeep(
    docs: Array<{ id: string; updated_at?: Date | string | null; created_at?: Date | string | null }>,
    preferredId?: string | null,
): { keepId: string; deleteIds: string[] } | null {
    if (!docs.length) return null;
    const preferred = preferredId?.trim() || null;
    const keepId = preferred && docs.some((doc) => doc.id === preferred)
        ? preferred
        : [...docs].sort(newestFirst)[0].id;
    return {
        keepId,
        deleteIds: docs.filter((doc) => doc.id !== keepId).map((doc) => doc.id),
    };
}

export function groupGeneratedPdfsToCollapse(
    docs: Array<{
        id: string;
        user_id?: unknown;
        contract_id?: unknown;
        extracted_fields?: unknown;
        file_name?: unknown;
        updated_at?: Date | string | null;
        created_at?: Date | string | null;
    }>,
    preferredIds: Iterable<string> = [],
): Array<{ keepId: string; deleteIds: string[] }> {
    const preferred = new Set([...preferredIds].filter(Boolean));
    const groups = new Map<string, typeof docs>();
    for (const doc of docs) {
        const key = generatedPdfCollapseKey(doc);
        if (!key) continue;
        const group = groups.get(key);
        if (group) group.push(doc);
        else groups.set(key, [doc]);
    }
    const result: Array<{ keepId: string; deleteIds: string[] }> = [];
    for (const group of groups.values()) {
        if (group.length < 2) continue;
        const preferredId = group.find((doc) => preferred.has(doc.id))?.id ?? null;
        const picked = pickGeneratedPdfToKeep(group, preferredId);
        if (picked && picked.deleteIds.length) result.push(picked);
    }
    return result;
}

function newestFirst(
    a: { updated_at?: Date | string | null; created_at?: Date | string | null },
    b: { updated_at?: Date | string | null; created_at?: Date | string | null },
): number {
    return timestamp(b) - timestamp(a);
}

function timestamp(doc: { updated_at?: Date | string | null; created_at?: Date | string | null }): number {
    const value = doc.updated_at ?? doc.created_at;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
