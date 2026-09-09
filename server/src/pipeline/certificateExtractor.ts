import OpenAI from "openai";
import {mkdirSync, writeFileSync} from "fs";
import {join} from "path";
import {getDataDir, getSettings} from "../settings";
import {logger} from "../logger";

export interface CertificateExtraction {
  // Certificate identity
  certificate_name: string | null;       // "תעודת מהנדס בטיחות בעבודה"
  certificate_type: string | null;       // "תעודה" / "הסמכה" / "רישיון"
  issuer: string | null;                 // "משרד העבודה" / "ועדת המומחים"
  issued_date: string | null;            // YYYY-MM-DD
  expiry_date: string | null;            // YYYY-MM-DD (null if permanent)

  // Inspector identity (maps to users)
  inspector_number: string | null;       // "מספר מפקח" / "מספר רישיון"
  title: string | null;                  // "מהנדס בטיחות" / "מהנדס מכונות"
  expertise: string | null;              // "בטיחות במכונות הרמה"
  membership_start_date: string | null;  // YYYY-MM-DD

  // Personal details (maps to users)
  full_name: string | null;              // falls back onto users.name if empty there
  address: string | null;
  phone: string | null;
  email: string | null;

  // Company / business details (maps to users.company_*)
  company_name: string | null;
  company_phone: string | null;
  company_email: string | null;

  confidence: "high" | "medium" | "low";
}

const SYSTEM_PROMPT = `You are an assistant specialized in extracting structured data from Hebrew professional certificates and licenses (תעודות, הסמכות, רישיונות) issued to Israeli engineers, safety inspectors, and similar professionals.

Extract the following fields from the certificate text and return ONLY valid JSON matching the schema. Use null when a field cannot be confidently determined. Do not invent data.

RULES:
1. Dates: normalize all dates to ISO 8601 (YYYY-MM-DD). Hebrew calendar → Gregorian. Israeli format DD/MM/YYYY → YYYY-MM-DD.
2. expiry_date is the certificate's validity END date (תוקף עד / בתוקף עד / פג תוקף). If the certificate is permanent (אין תאריך פקיעה / לצמיתות), set null.
3. issued_date is when the certificate was issued (תאריך הנפקה / תאריך הוצאה / ניתן ביום).
4. inspector_number: look for "מספר מפקח", "מספר רישיון", "מס' רישיון", "Inspector ID", "License No.".
5. title: the professional title in Hebrew (e.g. "מהנדס בטיחות בעבודה", "מהנדס מכונות").
6. expertise: the specific area of practice (e.g. "מכונות הרמה ואביזרי הרמה").
7. full_name: the person's full name as it appears on the certificate.
8. Phones: keep Israeli format (e.g. "050-1234567"). Insert dash after 3rd digit if missing.
9. Emails: if reversed (Hebrew PDF bidi artifact, e.g. "il.co.something@domain"), un-reverse to "domain@something.co.il".
10. Company name often appears in the letterhead/footer — distinguish from the issuing authority (issuer).
11. The text may have OCR or bidi artifacts; use context to resolve ambiguities.

JSON schema:
{
  "certificate_name": string | null,
  "certificate_type": string | null,
  "issuer": string | null,
  "issued_date": "YYYY-MM-DD" | null,
  "expiry_date": "YYYY-MM-DD" | null,
  "inspector_number": string | null,
  "title": string | null,
  "expertise": string | null,
  "membership_start_date": "YYYY-MM-DD" | null,
  "full_name": string | null,
  "address": string | null,
  "phone": string | null,
  "email": string | null,
  "company_name": string | null,
  "company_phone": string | null,
  "company_email": string | null,
  "confidence": "high" | "medium" | "low"
}`;

function buildClient(settings: ReturnType<typeof getSettings>) {
  if (settings.aiBackend === "ollama") {
    return new OpenAI({ baseURL: `${settings.ollamaUrl}/v1`, apiKey: "ollama" });
  }
  return new OpenAI({ apiKey: settings.openAiKey });
}

export interface CertificateExtractionRun {
  result: CertificateExtraction | null;
  rawJson: string;
  model: string;
  backend: string;
  execMs: number;
  error: string | null;
}

export async function extractCertificate(
  rawText: string,
  documentId?: string | number,
  fileName?: string
): Promise<CertificateExtractionRun> {
  const settings = getSettings();
  const model = settings.aiBackend === "ollama" ? settings.ollamaModel : settings.openAiModel;
  const backend = settings.aiBackend;
  const text = rawText.slice(0, settings.extractionMaxChars);

  const t0 = Date.now();
  let rawJson = "";
  let error: string | null = null;
  let result: CertificateExtraction | null = null;

  try {
    const client = buildClient(settings);
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Certificate text:\n\n${text}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });
    rawJson = response.choices[0]?.message?.content ?? "";
    result = JSON.parse(rawJson) as CertificateExtraction;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const execMs = Date.now() - t0;

  if (error) {
    logger.error("certificate_ai_extraction_failed", {
      document_id: documentId ?? null,
      backend,
      model,
      exec_ms: execMs,
      error,
    });
  } else {
    logger.info("certificate_ai_extraction_completed", {
      document_id: documentId ?? null,
      backend,
      model,
      exec_ms: execMs,
      parsed_ok: Boolean(result),
      confidence: result?.confidence ?? null,
    });
  }

  // Audit dump
  try {
    const dir = join(getDataDir(), "extractions");
    mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = (fileName ?? "cert").replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 80);
    writeFileSync(
      join(dir, `${ts}_doc${documentId ?? "X"}_${safeName}__cert.json`),
      JSON.stringify({ timestamp: ts, document_id: documentId, file_name: fileName, backend, model, exec_ms: execMs, error, input_text: text, result, raw_json: rawJson }, null, 2),
      "utf-8"
    );
  } catch { /* ignore */ }

  return { result, rawJson, model, backend, execMs, error };
}
