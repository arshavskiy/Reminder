export function parseObjectRecord(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value !== "string") return {};
    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // stored as a non-JSON string
    }
    return {};
}

export function firstTrimmedEmail(...values: unknown[]): string | null {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
}

export function pickContractEmail(
    contract?: { contact_email?: unknown; client_email?: unknown; manual_fields?: unknown } | null,
    extracted?: Record<string, unknown> | null,
    client?: { email?: unknown } | null,
): string | null {
    const manual = parseObjectRecord(contract?.manual_fields);
    const fields = extracted ?? {};
    return firstTrimmedEmail(
        contract?.contact_email,
        contract?.client_email,
        manual.contact_email,
        manual.client_email,
        fields.contact_email,
        fields.client_email,
        fields.email,
        client?.email,
    );
}
