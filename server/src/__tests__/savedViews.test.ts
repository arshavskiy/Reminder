import { describe, expect, it, vi, beforeEach } from "vitest";

// Unit tests for saved-views validation logic (mirrors server route constraints)
function validateSavedView(page: unknown, name: unknown, state: unknown): string | null {
  if (!page || typeof page !== "string") return "page required";
  if (!name || typeof name !== "string" || !(name as string).trim() || (name as string).length > 60) return "Invalid name";
  if (!state || typeof state !== "object" || Array.isArray(state)) return "state must be an object";
  return null;
}

describe("saved-views validation", () => {
  it("accepts valid inputs", () => {
    expect(validateSavedView("invoices", "My view", { status: "reviewed" })).toBeNull();
  });

  it("rejects missing page", () => {
    expect(validateSavedView("", "My view", {})).toBe("page required");
    expect(validateSavedView(null, "My view", {})).toBe("page required");
  });

  it("rejects blank name", () => {
    expect(validateSavedView("invoices", "  ", { x: 1 })).toBe("Invalid name");
  });

  it("rejects name over 60 chars", () => {
    expect(validateSavedView("invoices", "a".repeat(61), { x: 1 })).toBe("Invalid name");
  });

  it("accepts name exactly 60 chars", () => {
    expect(validateSavedView("invoices", "a".repeat(60), { x: 1 })).toBeNull();
  });

  it("rejects array as state", () => {
    expect(validateSavedView("invoices", "My view", [1, 2, 3])).toBe("state must be an object");
  });

  it("rejects null state", () => {
    expect(validateSavedView("invoices", "My view", null)).toBe("state must be an object");
  });

  it("accepts empty object state", () => {
    expect(validateSavedView("invoices", "My view", {})).toBeNull();
  });
});
