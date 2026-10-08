import {createHash} from "node:crypto";
import {col} from "../db/db.js";

// Exact supplier names match the existing bulk-category action. Do not merge
// similarly named businesses or share preferences across users.
function ruleId(userId: string, supplierName: string): string {
  return createHash("sha256").update(JSON.stringify([userId, supplierName.trim()])).digest("hex");
}

export async function saveSupplierCategory(userId: string, supplierName: string, category: string | null) {
  const filter = {_id: ruleId(userId, supplierName), user_id: userId};
  const rules = col<{_id: string; user_id: string; supplier_name: string; category: string; updated_at: Date}>("supplier_category_rules");
  if (category === null) {
    await rules.deleteOne(filter);
    return;
  }
  await rules.updateOne(filter, {$set: {
    supplier_name: supplierName.trim(), category, updated_at: new Date(),
  }}, {upsert: true});
}

export async function getSupplierCategory(userId: string | undefined, supplierName: string | null): Promise<string | undefined> {
  if (!userId || !supplierName?.trim()) return undefined;
  const rule = await col<{_id: string; user_id: string; category: string}>("supplier_category_rules")
    .findOne({_id: ruleId(userId, supplierName), user_id: userId});
  return rule?.category;
}
