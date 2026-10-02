import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/db", async () => await import("./helpers/memoryDb"));

import { memory, rows } from "./helpers/memoryDb";
import { DEFAULT_GMAIL_SEARCH_PROVIDERS, seedMissingGmailSearchProviders } from "../gmail/searchProviders";

const russian = DEFAULT_GMAIL_SEARCH_PROVIDERS.filter((provider) => provider.id.startsWith("ru-"));

describe("Russian Gmail search providers", () => {
  it("covers the main Russian receipt senders, each with Latin and Cyrillic terms", () => {
    expect(russian.length).toBeGreaterThanOrEqual(15);
    for (const provider of russian) {
      expect(provider.terms.some((term) => /[а-яё]/i.test(term)), provider.id).toBe(true);
    }
    const ids = new Set(russian.map((provider) => provider.id));
    for (const id of ["ru-ofd", "ru-ozon", "ru-wildberries", "ru-aeroflot", "ru-rzd", "ru-sber", "ru-tbank", "ru-gosuslugi"]) expect(ids.has(id), id).toBe(true);
  });

  it("has unique ids across all defaults", () => {
    const ids = DEFAULT_GMAIL_SEARCH_PROVIDERS.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

});

describe("seedMissingGmailSearchProviders", () => {
  beforeEach(() => memory.clear());

  it("adds only the defaults an existing table lacks and never overwrites an edited row", async () => {
    memory.set("gmail_search_providers", [
      { id: "iec", category: "household", label: "edited by admin", terms: ["custom"], sort_order: 10, enabled: false },
    ]);
    const added = await seedMissingGmailSearchProviders();
    expect(added).toBe(DEFAULT_GMAIL_SEARCH_PROVIDERS.length - 1);
    const iec = rows("gmail_search_providers").find((row) => row.id === "iec")!;
    expect(iec).toMatchObject({ label: "edited by admin", enabled: false, terms: ["custom"] });
    expect(rows("gmail_search_providers").some((row) => row.id === "ru-ozon")).toBe(true);
  });

  it("is a no-op once everything is present", async () => {
    await seedMissingGmailSearchProviders();
    expect(await seedMissingGmailSearchProviders()).toBe(0);
  });
});
