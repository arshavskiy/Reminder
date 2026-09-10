import {describe, expect, it} from "vitest";
import {
  BILLING_DOCUMENT_KINDS,
  belongsInMainDocumentsWorkspace,
  mainDocumentsFilter,
  MAIN_DOCUMENTS_EXCLUDED_KINDS,
  NON_IMPORTED_GENERATED_DOCUMENT_KINDS,
} from "../documents/documentVisibility";

describe("generated billing document visibility", () => {
  it.each(BILLING_DOCUMENT_KINDS)("keeps %s out of the inspection documents workspace", kind => {
    expect(belongsInMainDocumentsWorkspace(kind)).toBe(false);
    expect(MAIN_DOCUMENTS_EXCLUDED_KINDS).toContain(kind);
    expect(NON_IMPORTED_GENERATED_DOCUMENT_KINDS).toContain(kind);
  });

  it("keeps inspection reports in the main documents workspace", () => {
    expect(belongsInMainDocumentsWorkspace("inspection_report")).toBe(true);
  });

  it("counts only regular documents for a user", () => {
    expect(mainDocumentsFilter("user-1")).toEqual({
      user_id: "user-1",
      document_kind: { $nin: [...MAIN_DOCUMENTS_EXCLUDED_KINDS] },
    });
  });
});
