import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";
import {MongoClient} from "mongodb";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({path: resolve(__dirname, "../../.env")});

const DB_NAME = process.env.MONGODB_DB ?? "reminder-app";

async function main() {
    const uri = process.env.MONGODB_URI ?? process.env.MONGODB_LOCAL_URI;
    if (!uri) throw new Error("MONGODB_URI or MONGODB_LOCAL_URI is required");

    const client = new MongoClient(uri);
    await client.connect();
    try {
        const db = client.db(DB_NAME);
        const admins = await db.collection("users").find({role: "admin"}).project({_id: 1, email: 1}).toArray();
        const adminIds = admins.map((user) => user._id.toString());
        if (!adminIds.length) {
            console.log("No admin users found");
            return;
        }

        const result = await db.collection("print_templates").updateMany(
            {user_id: {$in: adminIds}, is_shared: {$ne: true}},
            {$set: {is_shared: true}},
        );
        const shared = await db.collection("print_templates").find(
            {is_shared: true},
            {projection: {name: 1, editorType: 1, user_id: 1}},
        ).toArray();
        console.log(`Promoted ${result.modifiedCount} templates for ${adminIds.length} admin(s)`);
        console.log("Admins:", admins.map((user) => user.email ?? user._id.toString()));
        console.log("Shared templates:", shared.map((t) => ({
            id: t._id.toString(),
            name: t.name,
            editorType: t.editorType ?? "grid",
        })));
    } finally {
        await client.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
