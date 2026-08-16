import {col} from "../db/db.js";
import {logger} from "../logger.js";

/** Mark every admin-owned print template as shared so all accounts can use them. */
export async function promoteSharedPrintTemplates(): Promise<number> {
    const admins = await col("users").find({role: "admin"}).project({_id: 1}).toArray();
    const adminIds = admins.map((user) => user._id.toString());
    if (!adminIds.length) return 0;

    const result = await col("print_templates").updateMany(
        {user_id: {$in: adminIds}, is_shared: {$ne: true}},
        {$set: {is_shared: true}},
    );
    if (result.modifiedCount) {
        logger.info("print_templates_shared", {admins: adminIds.length, count: result.modifiedCount});
    }
    return result.modifiedCount;
}
