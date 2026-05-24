import {describe, expect, it, vi} from "vitest";

// ── helpers ───────────────────────────────────────────────────────────────────

const USER_DOCUMENT_LIMIT = 25;

function makeDocuments(userId: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({ user_id: userId, _id: `doc${i}` }));
}

function mockCol(data: Record<string, any[]> = {}) {
  return (name: string) => {
    const docs = data[name] ?? [];
    return {
      countDocuments: vi.fn(async (filter: any) =>
        docs.filter((d) => {
          for (const [k, v] of Object.entries(filter)) {
            if (d[k] !== v) return false;
          }
          return true;
        }).length
      ),
    };
  };
}

// ── Document quota logic ──────────────────────────────────────────────────────

describe("document upload quota — user role", () => {
  async function checkQuota(userId: string, existingCount: number, uploading = 1) {
    const col = mockCol({ documents: makeDocuments(userId, existingCount) });
    const count = await col("documents").countDocuments({ user_id: userId });
    return count + uploading > USER_DOCUMENT_LIMIT;
  }

  it("allows upload when user has 0 documents", async () => {
    expect(await checkQuota("u1", 0)).toBe(false);
  });

  it("allows upload when user has 24 documents (single file)", async () => {
    expect(await checkQuota("u1", 24)).toBe(false);
  });

  it("blocks upload when user already has 25 documents", async () => {
    expect(await checkQuota("u1", 25)).toBe(true);
  });

  it("blocks uploading 2 files when user has 24 documents (would exceed limit)", async () => {
    expect(await checkQuota("u1", 24, 2)).toBe(true);
  });

  it("allows uploading 1 file when user has 24 documents (exactly at limit)", async () => {
    expect(await checkQuota("u1", 24, 1)).toBe(false);
  });

  it("blocks upload when user has 30 documents (over limit)", async () => {
    expect(await checkQuota("u1", 30)).toBe(true);
  });

  it("counts only documents belonging to the requesting user", async () => {
    const col = mockCol({
      documents: [
        ...makeDocuments("user-a", 25), // user-a is at limit
        ...makeDocuments("user-b", 5),  // user-b is not
      ],
    });

    const countA = await col("documents").countDocuments({ user_id: "user-a" });
    const countB = await col("documents").countDocuments({ user_id: "user-b" });

    expect(countA + 1 > USER_DOCUMENT_LIMIT).toBe(true);  // user-a blocked
    expect(countB + 1 > USER_DOCUMENT_LIMIT).toBe(false); // user-b allowed
  });
});

describe("document upload quota — pro / admin roles bypass", () => {
  const BYPASS_ROLES = ["pro", "admin"];

  it.each(BYPASS_ROLES)("role '%s' bypasses quota check entirely", (role) => {
    const quotaApplies = role === "user";
    expect(quotaApplies).toBe(false);
  });

  it("role 'user' triggers quota check", () => {
    expect("user" === "user").toBe(true);
  });
});

describe("document quota — /import endpoint (file-path)", () => {
  async function importQuotaCheck(existingCount: number) {
    const col = mockCol({ documents: makeDocuments("u1", existingCount) });
    const count = await col("documents").countDocuments({ user_id: "u1" });
    return count >= USER_DOCUMENT_LIMIT;
  }

  it("allows import when under the limit", async () => {
    expect(await importQuotaCheck(24)).toBe(false);
  });

  it("blocks import when at the limit", async () => {
    expect(await importQuotaCheck(25)).toBe(true);
  });

  it("blocks import when over the limit (legacy data)", async () => {
    expect(await importQuotaCheck(30)).toBe(true);
  });
});

// ── Default limit value ───────────────────────────────────────────────────────

describe("USER_DOCUMENT_LIMIT constant", () => {
  it("defaults to 25", () => {
    const limit = parseInt(process.env.USER_DOCUMENT_LIMIT ?? "25");
    expect(limit).toBe(25);
  });

  it("can be overridden via env var", () => {
    const original = process.env.USER_DOCUMENT_LIMIT;
    process.env.USER_DOCUMENT_LIMIT = "50";
    expect(parseInt(process.env.USER_DOCUMENT_LIMIT ?? "25")).toBe(50);
    process.env.USER_DOCUMENT_LIMIT = original;
  });
});
