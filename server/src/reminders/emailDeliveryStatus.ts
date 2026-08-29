import {col} from "../db/db";

export type EmailDeliverySummary = {
  status: "bounced" | "complained";
  recipient: string | null;
  reason: string | null;
  at: Date | string | null;
  reminder_id: string | null;
};

type EmailDeliveryLog = {
  reminder_id?: unknown;
  to_address?: unknown;
  recipient?: unknown;
  error?: unknown;
  sent_at?: unknown;
  delivery_at?: unknown;
  log_type?: unknown;
};

function normalizeId(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

function presentDeliveryLog(log: EmailDeliveryLog): EmailDeliverySummary {
  return {
    status: log.log_type === "complaint" ? "complained" : "bounced",
    recipient: typeof log.to_address === "string" && log.to_address.trim()
      ? log.to_address.trim()
      : typeof log.recipient === "string" && log.recipient.trim()
        ? log.recipient.trim()
        : null,
    reason: typeof log.error === "string" && log.error.trim() ? log.error.trim() : null,
    at: log.delivery_at instanceof Date || typeof log.delivery_at === "string"
      ? log.delivery_at
      : log.sent_at instanceof Date || typeof log.sent_at === "string"
        ? log.sent_at
        : null,
    reminder_id: normalizeId(log.reminder_id),
  };
}

export async function latestFailedDeliveryByReminderIds(
  reminderIds: string[],
): Promise<Map<string, EmailDeliverySummary>> {
  const ids = [...new Set(reminderIds.map((id) => String(id)).filter(Boolean))];
  const result = new Map<string, EmailDeliverySummary>();
  if (!ids.length) return result;

  const logs = await col("email_log").find(
    {
      reminder_id: { $in: ids },
      log_type: { $in: ["bounce", "complaint"] },
    },
    {
      projection: {
        reminder_id: 1,
        to_address: 1,
        recipient: 1,
        error: 1,
        sent_at: 1,
        delivery_at: 1,
        log_type: 1,
      },
    } as any,
  ).sort({ sent_at: -1 }).toArray() as EmailDeliveryLog[];

  for (const log of logs) {
    const reminderId = normalizeId(log.reminder_id);
    if (!reminderId || result.has(reminderId)) continue;
    result.set(reminderId, presentDeliveryLog(log));
  }
  return result;
}

export function latestFailedDeliveryForReminderIds(
  reminderIds: string[],
  failedDeliveryByReminderId: Map<string, EmailDeliverySummary>,
): EmailDeliverySummary | null {
  for (const id of reminderIds.map((value) => String(value)).filter(Boolean)) {
    const delivery = failedDeliveryByReminderId.get(id);
    if (delivery) return delivery;
  }
  return null;
}
