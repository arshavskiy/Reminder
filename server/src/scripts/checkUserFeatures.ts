import {connectDb} from "../db/db";

async function main() {
  const db = await connectDb();
  const doc = await db.collection("user_settings").findOne({user_id: "6a15e851abbd87e1e1071c6e"});
  console.log("_id:", doc?._id?.toString());
  console.log("features:", JSON.stringify(doc?.features, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
