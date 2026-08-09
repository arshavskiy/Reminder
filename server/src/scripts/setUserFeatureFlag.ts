import {connectDb} from "../db/db";

async function main() {
  const db = await connectDb();
  const userId = "6a15e851abbd87e1e1071c6e";

  const result = await db.collection("user_settings").updateOne(
    {user_id: userId},
    [
      {
        $set: {
          "features.dashboard.calendar_filters": false,
          updated_at: new Date(),
          user_id: {$ifNull: ["$user_id", userId]},
          created_at: {$ifNull: ["$created_at", new Date()]},
        },
      },
    ],
    {upsert: true}
  );

  console.log(`Updated user ${userId}: matched ${result.matchedCount}, modified ${result.modifiedCount}, upserted ${result.upsertedId ? 1 : 0}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
