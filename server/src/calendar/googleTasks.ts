import { createHash } from "crypto";
import { logger } from "../logger";

const TASKS_API = "https://tasks.googleapis.com/tasks/v1";
export const TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
const DEFAULT_LIST = "@default";

export interface GoogleTask {
  id?: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: string;
  etag?: string;
}

export function buildTask(reminder: any): GoogleTask {
  const title = String(reminder.title ?? "").trim() || "תזכורת אישית";
  const date = String(reminder.expiry_date ?? reminder.trigger_date ?? "").slice(0, 10);
  const notes = [
    reminder.reminder_category ? `קטגוריה: ${reminder.reminder_category}` : null,
    reminder.body ? String(reminder.body) : null,
  ].filter(Boolean).join("\n") || undefined;
  return {
    title,
    notes,
    due: date ? `${date}T00:00:00.000Z` : undefined,
  };
}

export function taskPayloadHash(task: GoogleTask): string {
  return createHash("sha1")
    .update(JSON.stringify([task.title, task.notes, task.due]))
    .digest("hex");
}

async function tasksFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${TASKS_API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export async function insertTask(accessToken: string, task: GoogleTask): Promise<GoogleTask> {
  const res = await tasksFetch(accessToken, `lists/${encodeURIComponent(DEFAULT_LIST)}/tasks`, {
    method: "POST",
    body: JSON.stringify(task),
  });
  if (!res.ok) throw new Error(`tasks insert failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<GoogleTask>;
}

export async function patchTask(
  accessToken: string,
  taskId: string,
  task: GoogleTask,
): Promise<GoogleTask | null> {
  const res = await tasksFetch(
    accessToken,
    `lists/${encodeURIComponent(DEFAULT_LIST)}/tasks/${encodeURIComponent(taskId)}`,
    { method: "PATCH", body: JSON.stringify(task) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`tasks patch failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<GoogleTask>;
}

export async function deleteTask(accessToken: string, taskId: string): Promise<void> {
  const res = await tasksFetch(
    accessToken,
    `lists/${encodeURIComponent(DEFAULT_LIST)}/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) {
    logger.warn("tasks_delete_failed", { task_id: taskId, status: res.status });
  }
}
