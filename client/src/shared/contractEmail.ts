import type {ContractWithClient} from "./types";

export function contractRowHasEmail(row: Pick<ContractWithClient, "contact_email" | "manual_fields"> & {
    client_email?: string | null;
}): boolean {
    const manual = row.manual_fields && typeof row.manual_fields === "object" ? row.manual_fields : {};
    const candidates = [
        row.contact_email,
        row.client_email,
        manual.contact_email,
        manual.client_email,
    ];
    return candidates.some((value) => typeof value === "string" && value.trim().length > 0);
}
