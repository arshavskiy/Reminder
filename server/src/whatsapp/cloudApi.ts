import {createHmac, timingSafeEqual} from "node:crypto";

export function normalizeWhatsAppPhone(value: unknown): string | null {
  if (typeof value !== "string" || !/^[+\d\s().-]+$/.test(value.trim())) return null;
  let phone = value.replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (/^0[2-9]\d{7,8}$/.test(phone)) phone = `972${phone.slice(1)}`;
  return /^[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

const required = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_API_VERSION", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"];
export function whatsappConfigStatus() {
  const missing = required.filter(key => !process.env[key]?.trim());
  const validIds = /^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID || "")
    && /^\d+$/.test(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "");
  const validVersion = /^v\d+\.\d+$/.test(process.env.WHATSAPP_API_VERSION || "");
  const configured = !missing.length && validIds && validVersion;
  return {configured, enabled: configured && process.env.WHATSAPP_ENABLED === "true", missing,
    sender: process.env.WHATSAPP_DISPLAY_PHONE || "", webhookPath: "/api/webhooks/whatsapp"};
}

export class WhatsAppApiError extends Error {
  constructor(public code: string, public retryable = false, public uncertain = false) { super(code); }
}

async function graph(path: string, body?: unknown): Promise<any> {
  if (!whatsappConfigStatus().configured) throw new WhatsAppApiError("whatsapp_not_configured");
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${path}`, {
      method: body ? "POST" : "GET",
      headers: {Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json"},
      ...(body ? {body: JSON.stringify(body)} : {}),
      signal: AbortSignal.timeout(20000),
    });
  } catch { throw new WhatsAppApiError("network_outcome_unknown", false, Boolean(body)); }
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.error) {
    // Do not persist provider text: it can contain tokens or recipient data.
    throw new WhatsAppApiError(`meta_${json?.error?.code || response.status}`,
      response.status === 429, response.status >= 500 && Boolean(body));
  }
  if (!json) throw new WhatsAppApiError("invalid_provider_response", false, Boolean(body));
  return json;
}

export type WhatsAppTemplate = {name: string; language: string; body: string; parameters: number};
export function supportedTemplate(raw: any): WhatsAppTemplate | null {
  if (raw?.status !== "APPROVED" || !Array.isArray(raw.components)) return null;
  if (raw.components.some((c: any) => !["BODY", "FOOTER"].includes(c.type))) return null;
  const body = raw.components.find((c: any) => c.type === "BODY")?.text;
  if (typeof body !== "string" || typeof raw.name !== "string" || typeof raw.language !== "string") return null;
  const tokens = [...body.matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1]);
  if (tokens.some(token => !/^[1-9]\d*$/.test(token))) return null;
  const positions = [...new Set(tokens.map(Number))].sort((a, b) => a - b);
  if (positions.some((value, index) => value !== index + 1)) return null;
  return {name: raw.name, language: raw.language, body, parameters: positions.length};
}

export async function listWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  const templates: WhatsAppTemplate[] = [];
  let after: string | undefined;
  do {
    const query = new URLSearchParams({fields: "name,language,status,components", limit: "100", ...(after ? {after} : {})});
    const result = await graph(`${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?${query}`);
    for (const raw of result.data || []) {
      const template = supportedTemplate(raw);
      if (template) templates.push(template);
    }
    after = result.paging?.next ? result.paging?.cursors?.after : undefined;
  } while (after && templates.length < 1000);
  return templates;
}

export async function sendWhatsAppTemplate(job: {phone: string; template: WhatsAppTemplate; parameters: string[]; callback: string}): Promise<string> {
  if (!whatsappConfigStatus().enabled) throw new WhatsAppApiError("whatsapp_disabled");
  const result = await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp", recipient_type: "individual", to: job.phone,
    type: "template", biz_opaque_callback_data: job.callback,
    template: {name: job.template.name, language: {code: job.template.language},
      ...(job.parameters.length ? {components: [{type: "body", parameters: job.parameters.map(text => ({type: "text", text}))}]} : {})},
  });
  const id = result.messages?.[0]?.id;
  if (typeof id !== "string") throw new WhatsAppApiError("missing_message_id", false, true);
  return id;
}

export function verifyWhatsAppSignature(body: Buffer, signature: unknown, secret: string): boolean {
  if (!secret || typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(createHmac("sha256", secret).update(body).digest(), Buffer.from(signature.slice(7), "hex"));
}

export const deliveryRank: Record<string, number> = {queued: 0, sending: 1, unknown: 1, accepted: 2, sent: 3, failed: 4, delivered: 5, read: 6};
export function isWhatsAppStop(text: unknown): boolean {
  return typeof text === "string" && /^(stop|unsubscribe|הסר|הסרה|הפסק)$/i.test(text.trim());
}

export async function sendWhatsAppText(to: string, text: string): Promise<void> {
  if (!whatsappConfigStatus().enabled) return;
  await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp", recipient_type: "individual", to,
    type: "text", text: {body: text},
  });
}

export async function downloadWhatsAppMedia(mediaId: string): Promise<{buffer: Buffer; mimeType: string; filename: string}> {
  const meta = await graph(mediaId);
  const url: string = meta.url;
  const mimeType: string = meta.mime_type ?? "application/octet-stream";
  if (!url) throw new WhatsAppApiError("missing_media_url");
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`},
      signal: AbortSignal.timeout(60000),
    });
  } catch { throw new WhatsAppApiError("network_outcome_unknown", false, false); }
  if (!response.ok) throw new WhatsAppApiError(`meta_${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const extMap: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/tiff": ".tif",
  };
  const ext = extMap[mimeType] ?? ".bin";
  const filename = `wa_${mediaId}${ext}`;
  return {buffer: Buffer.from(arrayBuffer), mimeType, filename};
}
