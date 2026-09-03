import {defineConfig, devices} from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "tests", ".env.test") });

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [["html", { open: "never" }], ["line"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:4173", // matches vite.config.ts server.port, not the CRA-era 5173 this pointed at
    storageState: "tests/e2e/.auth/user.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "he-IL",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
