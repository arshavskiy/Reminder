/**
 * Reminder email template selection order (highest priority first):
 * 1. reminder.email_template_id
 * 2. user_settings.default_email_template_id
 * 3. email template bound to the document's doc_template_id
 * 4. global is_default template
 */

export type ReminderTemplateSource =
  | "reminder"
  | "user_default"
  | "doc_bound"
  | "global_default"
  | "none";

export function resolveReminderTemplateSource(opts: {
  reminderTemplateId?: string | null;
  userDefaultTemplateId?: string | null;
  docBoundTemplateId?: string | null;
  globalDefaultTemplateId?: string | null;
}): { templateId: string | null; source: ReminderTemplateSource } {
  const reminderId = normalizeId(opts.reminderTemplateId);
  if (reminderId) return { templateId: reminderId, source: "reminder" };

  const userDefault = normalizeId(opts.userDefaultTemplateId);
  if (userDefault) return { templateId: userDefault, source: "user_default" };

  const docBound = normalizeId(opts.docBoundTemplateId);
  if (docBound) return { templateId: docBound, source: "doc_bound" };

  const globalDefault = normalizeId(opts.globalDefaultTemplateId);
  if (globalDefault) return { templateId: globalDefault, source: "global_default" };

  return { templateId: null, source: "none" };
}

function normalizeId(value: unknown): string | null {
  if (value == null) return null;
  const id = String(value).trim();
  return id || null;
}
