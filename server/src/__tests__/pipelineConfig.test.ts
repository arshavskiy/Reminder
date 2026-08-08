import {describe, expect, it} from "vitest";
import {mergeExtractionConfig} from "../pipeline/extractor";
import type {AppSettings, DocTemplate, PipelineProfile} from "../../src/shared/types.js";

function systemSettings(): AppSettings {
  return {
    theme: "dark",
    port: 3000,
    aiBackend: "openai",
    openAiKey: "sk-system",
    openAiModel: "gpt-system",
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "llama-system",
    ocrLanguage: "heb+eng",
    autoExtract: true,
    extractionMaxChars: 10000,
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "",
    smtpPass: "",
    smtpRejectUnauthorized: true,
    emailFrom: "",
    emailFromName: "",
    reminderEnabled: true,
    reminderAdvanceDays: [30, 14, 7],
    reminderCheckIntervalMs: 60000,
    testEmail: "",
    testEmailTemplateId: null,
    watchFolderEnabled: false,
    watchFolder: "",
  } as AppSettings;
}

function template(overrides: Partial<DocTemplate> = {}): DocTemplate {
  return {
    id: 1,
    name: "t",
    description: null,
    document_kind: "unknown",
    match_keywords: [],
    fields: [],
    expiry_field: null,
    cached_system_prompt: null,
    is_default: 0,
    is_builtin: 0,
    created_at: "",
    updated_at: "",
    ...overrides,
  } as DocTemplate;
}

function profile(overrides: Partial<PipelineProfile> = {}): PipelineProfile {
  return {
    id: "p1",
    user_id: "u1",
    name: "profile",
    created_at: "",
    updated_at: "",
    ...overrides,
  } as PipelineProfile;
}

describe("mergeExtractionConfig — 4-layer resolution chain", () => {
  it("falls back to system settings when nothing overrides", () => {
    const r = mergeExtractionConfig(systemSettings(), null, null);
    expect(r.backend).toBe("openai");
    expect(r.model).toBe("gpt-system");
    expect(r.maxChars).toBe(10000);
    expect(r.customPromptRules).toBeNull();
  });

  it("profile overrides system settings", () => {
    const r = mergeExtractionConfig(
      systemSettings(),
      null,
      profile({ ai_model: "gpt-profile", extraction_max_chars: 5000, custom_prompt_rules: "profile rule" })
    );
    expect(r.model).toBe("gpt-profile");
    expect(r.maxChars).toBe(5000);
    expect(r.customPromptRules).toBe("profile rule");
  });

  it("template overrides both profile and system settings", () => {
    const r = mergeExtractionConfig(
      systemSettings(),
      template({ ai_model: "gpt-template", extraction_max_chars: 2000 }),
      profile({ ai_model: "gpt-profile", extraction_max_chars: 5000 })
    );
    expect(r.model).toBe("gpt-template");
    expect(r.maxChars).toBe(2000);
  });

  it("resolves per-key: template wins model, profile wins maxChars when template omits it", () => {
    const r = mergeExtractionConfig(
      systemSettings(),
      template({ ai_model: "gpt-template" }),          // no max chars override
      profile({ extraction_max_chars: 5000 })          // no model override
    );
    expect(r.model).toBe("gpt-template");
    expect(r.maxChars).toBe(5000);
  });

  it("switches to ollama model default when backend override selects ollama", () => {
    const r = mergeExtractionConfig(
      systemSettings(),
      template({ ai_backend: "ollama" }),   // backend only, no explicit model
      null
    );
    expect(r.backend).toBe("ollama");
    expect(r.model).toBe("llama-system");   // picks ollama default, not openai default
    expect(r.settings.aiBackend).toBe("ollama");
  });

  it("never leaks secrets — keeps env-only openAiKey from system settings", () => {
    const r = mergeExtractionConfig(
      systemSettings(),
      template({ ai_model: "gpt-template" }),
      profile({ ai_model: "gpt-profile" })
    );
    // API key is not overridable via template/profile; stays as system value.
    expect(r.settings.openAiKey).toBe("sk-system");
  });
});
