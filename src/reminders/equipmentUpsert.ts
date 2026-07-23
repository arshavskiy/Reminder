import {ObjectId} from "mongodb";
import {col} from "../db/db";
import type {EquipmentCategory} from "../../src/shared/types.js";

export interface EquipmentInput {
  category?: EquipmentCategory | string | null;
  name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
}

/**
 * Creates or reuses an equipment record for a client.
 *
 * serial_number has a globally unique index (not scoped per user), so two
 * different accounts can legitimately submit the same value (a shared generic
 * serial, a coincidence, or a retried request). Reusing another user's record
 * would leak data across tenants, so: if it's this user's own equipment, reuse
 * and re-link it; if it belongs to someone else, drop the serial number rather
 * than crash the whole request on a duplicate-key error.
 *
 * Returns the equipment _id, or undefined when there's nothing meaningful to
 * store (no category and no identifying fields).
 */
export async function upsertEquipmentForClient(
  eq: EquipmentInput,
  clientId: string,
  clientDisplayName: string,
  userId: string,
  now: Date
): Promise<ObjectId | undefined> {
  const category = (eq.category as EquipmentCategory) || "other";
  const manufacturer = eq.manufacturer?.trim() || null;
  const model = eq.model?.trim() || null;
  const requestedSerial = eq.serial_number?.trim() || undefined;
  const name = eq.name?.trim() || clientDisplayName;

  // Nothing worth persisting.
  if (!manufacturer && !model && !requestedSerial && (!eq.category || eq.category === "other")) {
    return undefined;
  }

  let serialNumber = requestedSerial;
  if (requestedSerial) {
    const existing = await col("equipment").findOne({ serial_number: requestedSerial }) as any;
    if (existing && existing.user_id === userId) {
      await col("equipment").updateOne(
        { _id: existing._id },
        {
          $set: {
            client_id: clientId,
            ...(manufacturer && { manufacturer }),
            ...(model && { model }),
            updated_at: now,
          },
        }
      );
      return existing._id;
    } else if (existing) {
      serialNumber = undefined; // belongs to another user — drop it to avoid the unique-index conflict
    }
  }

  const doc = {
    user_id: userId,
    name,
    category,
    manufacturer,
    model,
    ...(serialNumber && { serial_number: serialNumber }),
    capacity: null,
    load_capacity_test: null,
    load_radius: null,
    description: null,
    notes: null,
    client_id: clientId,
    document_id: null,
    is_active: 1,
    created_at: now,
    updated_at: now,
  };
  return (await col("equipment").insertOne(doc as any)).insertedId;
}
