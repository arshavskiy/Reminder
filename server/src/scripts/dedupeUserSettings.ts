import {connectDb} from "../db/db";

async function main() {
  const db = await connectDb();
  const col = db.collection("user_settings");

  // Find all docs for this user
  const docs = await col.find({user_id: "6a15e851abbd87e1e1071c6e"}).toArray();
  console.log(`Found ${docs.length} docs for user`);
  docs.forEach((d) => console.log(" _id:", d._id.toString(), "updated_at:", d.updated_at));

  if (docs.length <= 1) { console.log("No duplicates."); process.exit(0); }

  // Keep the one with the most recent updated_at, delete the rest
  const sorted = docs.sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime());
  const keep = sorted[0];
  const deleteIds = sorted.slice(1).map((d) => d._id);

  console.log("Keeping:", keep._id.toString());
  console.log("Deleting:", deleteIds.map((id) => id.toString()));

  await col.deleteMany({_id: {$in: deleteIds}});
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
