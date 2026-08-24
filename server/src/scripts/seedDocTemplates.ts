import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { closeDb, connectDb } from "../db/db";
import { seedBuiltinTemplates } from "../templates/seedTemplates";

await connectDb();
await seedBuiltinTemplates();
await closeDb();
