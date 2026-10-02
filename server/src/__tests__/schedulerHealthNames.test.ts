import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Every job the scheduler wraps in runWithHealth writes a scheduler_health row. The
// admin process dashboard only shows the rows named in SCHEDULER_HEALTH_NAMES, so a
// job missing from that list runs but never appears there. This keeps them in step.
const SRC = join(__dirname, "..");
const scheduler = readFileSync(join(SRC, "reminders", "scheduler.ts"), "utf8");
const admin = readFileSync(join(SRC, "routes", "admin.ts"), "utf8");
const adminPage = readFileSync(join(SRC, "..", "..", "client", "src", "views", "AdminPage.vue"), "utf8");

const jobNames = [...scheduler.matchAll(/runWithHealth\("([A-Za-z]+)"/g)].map((match) => match[1]);
const listed = (() => {
  const block = /SCHEDULER_HEALTH_NAMES[^=]*=\s*\{\s*scheduler:\s*\[([^\]]*)\]/.exec(admin)?.[1] ?? "";
  return [...block.matchAll(/"([A-Za-z]+)"/g)].map((match) => match[1]);
})();

describe("scheduler jobs on the admin dashboard", () => {
  it("finds the scheduler's jobs", () => {
    expect(jobNames).toEqual(expect.arrayContaining(["checkDiscoveryScans", "checkInvoiceScans", "checkMonthlyReports"]));
  });

  it("lists every runWithHealth job (and the main tick) in SCHEDULER_HEALTH_NAMES", () => {
    const missing = ["tick", ...jobNames].filter((name) => !listed.includes(name));
    expect(missing).toEqual([]);
  });

  it("has a readable label for each job in the admin page", () => {
    const missing = jobNames.filter((name) => !new RegExp(`\\b${name}:\\s*"`).test(adminPage));
    expect(missing).toEqual([]);
  });
});
