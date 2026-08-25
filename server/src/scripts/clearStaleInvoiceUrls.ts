import "./loadEnv"; // must precede ../db/db — see loadEnv.ts
import {closeDb, col, connectDb} from "../db/db";

/**
 * Clears cached signed URLs that still reference pre-migration storage keys.
 *
 * Documents migrated before the key migration learned to unset these kept a
 * download_url signed over the old object, which now 404s. The download route
 * re-signs whenever download_url is absent, so unsetting is a safe repair.
 *
 *   --apply   perform the update (default is a dry run)
 */

const apply = process.argv.includes("--apply");

await connectDb();

try {
  const filter = {
    spaces_key: {$regex: "/invoices/"},
    $or: [
      {download_url: {$regex: "gmail/invoices/"}},
      {spaces_url: {$regex: "gmail/invoices/"}},
    ],
  };

  const affected = await col("documents").countDocuments(filter as any);

  if (!apply) {
    console.log(JSON.stringify({affected, applied: false}, null, 2));
    console.log("\nDry run. Re-run with --apply to clear the stale URLs.");
  } else {
    const result = await col("documents").updateMany(
      filter as any,
      {
        $unset: {spaces_url: "", download_url: "", signed_url_expires_at: ""},
        $set: {updated_at: new Date()},
      } as any,
    );
    console.log(JSON.stringify({affected, modified: result.modifiedCount, applied: true}, null, 2));
  }
} finally {
  await closeDb();
}
