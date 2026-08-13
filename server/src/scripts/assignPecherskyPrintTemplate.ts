import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";
import {MongoClient, ObjectId} from "mongodb";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({path: resolve(__dirname, "../../.env")});

const TARGET_EMAIL = "pechersky.m@gmail.com";
const SOURCE_TEMPLATE_ID = "6a7cfbee5e95a7b2e1e4b606";
const DB_NAME = process.env.MONGODB_DB ?? "reminder-app";

function asObjectId(id: string): ObjectId {
  return new ObjectId(id);
}

async function main() {
  const uri = process.env.MONGODB_URI ?? process.env.MONGODB_LOCAL_URI;
  if (!uri) throw new Error("MONGODB_URI or MONGODB_LOCAL_URI is required");

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    const users = db.collection("users");
    const templates = db.collection("print_templates");

    const user = await users.findOne({email: TARGET_EMAIL}) as any;
    if (!user?._id) throw new Error(`User not found: ${TARGET_EMAIL}`);

    const userId = user._id.toString();
    const source = await templates.findOne({_id: asObjectId(SOURCE_TEMPLATE_ID)}) as any;
    if (!source) throw new Error(`Source print template not found: ${SOURCE_TEMPLATE_ID}`);

    if (String(source.user_id ?? "") === userId) {
      console.log(`Template ${SOURCE_TEMPLATE_ID} already belongs to ${TARGET_EMAIL}`);
      return;
    }

    const existingForUser = await templates.findOne({
      user_id: userId,
      name: source.name,
    }) as any;
    if (existingForUser?._id) {
      console.log(`Template already exists for ${TARGET_EMAIL}: ${existingForUser._id.toString()} (${existingForUser.name})`);
      return;
    }

    const now = new Date().toISOString();
    const {_id, ...sourceBody} = source;
    const copy = {
      ...sourceBody,
      user_id: userId,
      created_at: now,
      updated_at: now,
    };

    const result = await templates.insertOne(copy);
    console.log(`Copied print template for ${TARGET_EMAIL}: ${result.insertedId.toString()} (${source.name})`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
