import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { closeDb, connectDb } from "../db/db";
import { seedGmailSearchProviders } from "../gmail/searchProviders";

await connectDb();
await seedGmailSearchProviders();
await closeDb();
