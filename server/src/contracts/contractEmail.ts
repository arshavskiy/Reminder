import {normalizeEmail} from "../pipeline/importer.js";

export function parseObjectRecord(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value !== "string") return {};
    try {
        let parsed: unknown = JSON.parse(value);
        if (typeof parsed === "string") {
            try { parsed = JSON.parse(parsed); } catch { /* keep the inner string */ }
        }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // stored as a non-JSON string
    }
    return {};
}

export function parseReminderEmailTo(value: unknown): string[] {
    const normalizeList = (items: string[]) =>
        items.filter(Boolean).map((item) => normalizeEmail(item)).filter(Boolean);

    if (Array.isArray(value)) {
        return normalizeList(value.filter((item): item is string => typeof item === "string" && item.includes("@")).map((item) => item.trim()));
    }
    if (typeof value !== "string" || !value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return normalizeList(parsed.filter((item): item is string => typeof item === "string" && item.includes("@")).map((item) => item.trim()));
        }
        if (typeof parsed === "string" && parsed.includes("@")) return normalizeList([parsed.trim()]);
    } catch {
        // Manual reminders may still contain a plain email string.
    }
    return value.includes("@") ? normalizeList([value.trim()]) : [];
}

export function firstTrimmedEmail(...values: unknown[]): string | null {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return normalizeEmail(value.trim());
    }
    return null;
}

function firstTrimmedEmailRaw(...values: unknown[]): string | null {
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
    return pickContractEmailWithMeta(contract, extracted, client).email;
}

export function pickContractEmailWithMeta(
    contract?: { contact_email?: unknown; client_email?: unknown; manual_fields?: unknown } | null,
    extracted?: Record<string, unknown> | null,
    client?: { email?: unknown } | null,
): { email: string | null; raw: string | null; corrected: boolean } {
    const manual = parseObjectRecord(contract?.manual_fields);
    const fields = extracted ?? {};
    const raw = firstTrimmedEmailRaw(
        contract?.contact_email,
        contract?.client_email,
        manual.contact_email,
        manual.client_email,
        fields.contact_email,
        fields.client_email,
        fields.email,
        client?.email,
    );
    const email = raw ? normalizeEmail(raw) : null;
    const corrected = Boolean(raw && email && normalizeEmail(raw) !== raw.toLowerCase());
    return { email, raw, corrected };
}
