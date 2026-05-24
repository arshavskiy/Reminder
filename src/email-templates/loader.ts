import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadAuthTemplate(name: "verify-email" | "reset-password"): string {
  return readFileSync(join(__dirname, "auth", `${name}.html`), "utf-8");
}

export function loadReminderTemplate(name: "default" | "inspection" | "contract" | "invoice"): string {
  return readFileSync(join(__dirname, "reminders", `${name}.html`), "utf-8");
}
