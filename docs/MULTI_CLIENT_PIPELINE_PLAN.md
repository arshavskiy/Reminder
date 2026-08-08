# Multi-Client Pipeline Configuration — Implementation Plan

## Problem

All AI model selection, OCR settings, system prompts, and reminder rules are
hardcoded or env-var-only. Adding a new client type or changing a model requires
a code change + redeploy.

## Goal

Allow admin/users to configure per-client and per-document-type pipelines
(AI model, OCR language, custom prompt rules, reminder schedule) through the
admin UI — no redeploy needed.

## Architecture: 4-Layer Resolution Chain

```
Priority (highest → lowest):
1. clients.preferred_template_id    – force a specific template; skip auto-detect
2. doc_templates.*                  – per-document-type AI / OCR / prompt / reminder config
3. pipeline_profiles (via client)   – shared config block for many clients in same industry
4. system_settings (DB singleton)   – global admin-editable defaults          ← Phase 1
5. env vars                         – fallback / secrets only (never removed)
```

---

## Phase 1 — DB-backed Global Settings ✅ COMPLETE

**Unblocks:** AI model + OCR language changes without redeploy.

### Changes
| File | Change |
|------|--------|
| `server/src/shared/types.ts` | Add `SystemSettingsOverride` interface |
| `server/src/db/db.ts` | Add `system_settings` to collection list |
| `server/src/effectiveSettings.ts` | **New** — `getEffectiveSettings()`, 30s cache, `OVERRIDABLE_KEYS` |
| `server/src/routes/settings.ts` | `POST /api/settings` saves to DB; `GET` annotates `_sources` per field |
| `server/src/pipeline/extractor.ts` | `getSettings` → `getEffectiveSettings` |
| `server/src/pipeline/ocrParser.ts` | `getSettings` → `getEffectiveSettings` |
| `server/src/routes/extractReminders.ts` | `getSettings` → `getEffectiveSettings` |
| `client/src/views/SettingsPage.vue` | Add OCR section; mark API key + SMTP pass as env-only |

---

## Phase 2 — DocTemplate AI + Prompt Overrides 🔲 TODO

**Unblocks:** Per-document-type AI model and custom instructions without code changes.

### New fields on `DocTemplate` (all optional/nullable)
```ts
ai_backend?:            "openai" | "ollama" | null  // null = use system_settings
ai_model?:              string | null
ocr_language?:          string | null
extraction_max_chars?:  number | null
reminder_advance_days?: number[] | null
custom_prompt_rules?:   string | null   // appended to auto-generated prompt
full_prompt_override?:  string | null   // replaces buildPromptForTemplate entirely
```

### Files to change
| File | Change |
|------|--------|
| `server/src/shared/types.ts` | Extend `DocTemplate` with above fields |
| `server/src/templates/buildPrompt.ts` | Accept `customRules?` param; append before schema block |
| `server/src/pipeline/extractor.ts` | Merge template AI fields into client config + model |
| `server/src/routes/templates.ts` | Accept + persist new fields in `PUT /api/doc-templates/:id` |
| `client/src/views/DocTemplatesPage.vue` | Add "AI & Pipeline" collapsible section in template editor |

---

## Phase 3 — PipelineProfiles + Client Links 🔲 TODO

**Unblocks:** Per-client config; one profile reused across many clients.

### New collection: `pipeline_profiles`
```ts
{
  _id: ObjectId, user_id: string, name: string, description?: string,
  ai_backend?: string | null, ai_model?: string | null,
  ocr_language?: string | null, extraction_max_chars?: number | null,
  reminder_advance_days?: number[] | null,
  default_template_id?: string | null,
  custom_prompt_rules?: string | null,
  created_at: Date, updated_at: Date,
}
```

### New fields on `clients`: `pipeline_profile_id`, `preferred_template_id`

### Files to change
| File | Change |
|------|--------|
| `server/src/shared/types.ts` | Add `PipelineProfile`; extend `Client` |
| `server/src/db/db.ts` | Add `pipeline_profiles` collection + indexes |
| `server/src/routes/pipelineProfiles.ts` | **New** — CRUD routes |
| `server/src/routes/clients.ts` | Accept/return new client fields |
| `server/src/pipeline/extractor.ts` | `resolveExtractionConfig(clientId?, templateId?)` helper |
| `server/src/templates/seedTemplates.ts` | `pickTemplate()` checks `preferred_template_id` first |
| `server/src/index.ts` | Register pipeline-profiles routes |
| `client/src/views/ClientDetailPage.vue` | Show/set profile + preferred template |
| `client/src/services/apiService.ts` | Pipeline profile API calls |

---

## Phase 4 — Admin UI Polish + Tests 🔲 TODO

### Admin sections (extend `AdminPage.vue`)
- "Pipeline Profiles" tab — CRUD
- "System Settings" tab — live AI/OCR config

### Tests
- `server/src/__tests__/pipelineConfig.test.ts` — resolution chain unit tests
- Extend `server/src/__tests__/buildPrompt.test.ts` — `custom_rules` + full override cases

---

## Status

- [x] Phase 1 — DB-backed global settings
- [ ] Phase 2 — DocTemplate AI/prompt overrides
- [ ] Phase 3 — PipelineProfiles + client links
- [ ] Phase 4 — Admin UI polish + tests
