import {col} from "../db/db";

/**
 * Reminders and contracts keep a denormalized copy of the client's email so a send
 * does not need to re-resolve it. Editing the client alone therefore leaves those
 * copies stale — the address the user "fixed" is still the one that gets mailed.
 * Rewrite the copies whenever the client's email actually changes.
 *
 * `reminders.email_to` is a JSON-encoded array of recipients, so the old address is
 * swapped inside it and any other recipients on that reminder are preserved. Only
 * reminders that can still send are touched: already-sent rows are a record of what
 * went out and must stay accurate.
 */
export async function propagateClientEmailChange(params: {
  userId: string;
  clientId: string;
  oldEmail: string | null | undefined;
  newEmail: string | null | undefined;
}): Promise<{reminders: number; contracts: number}> {
  const oldEmail = String(params.oldEmail ?? "").trim();
  const newEmail = String(params.newEmail ?? "").trim();
  if (!oldEmail || !newEmail || oldEmail.toLowerCase() === newEmail.toLowerCase()) {
    return {reminders: 0, contracts: 0};
  }

  const {userId, clientId} = params;
  const now = new Date();
  let reminders = 0;

  const pending = await col("reminders").find({
    user_id: userId,
    client_id: clientId,
    status: {$nin: ["sent", "dismissed"]},
  } as any).project({email_to: 1, client_email: 1}).toArray();

  for (const row of pending as any[]) {
    const patch: Record<string, unknown> = {};
    if (typeof row.email_to === "string" && row.email_to.includes(oldEmail)) {
      patch.email_to = row.email_to.split(oldEmail).join(newEmail);
    }
    if (typeof row.client_email === "string" && row.client_email.includes(oldEmail)) {
      patch.client_email = row.client_email.split(oldEmail).join(newEmail);
    }
    if (!Object.keys(patch).length) continue;
    patch.updated_at = now;
    await col("reminders").updateOne({_id: row._id}, {$set: patch});
    reminders++;
  }

  const contractResult = await col("contracts").updateMany(
    {user_id: userId, client_id: clientId, contact_email: oldEmail} as any,
    {$set: {contact_email: newEmail, updated_at: now}},
  );

  return {reminders, contracts: contractResult.modifiedCount ?? 0};
}
