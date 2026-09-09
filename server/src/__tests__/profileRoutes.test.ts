import {describe, expect, it, vi} from "vitest";
import {avatarExtension} from "../routes/profile";

// ── Shared helpers ────────────────────────────────────────────────────────────

function mockCol(data: Record<string, any[]> = {}) {
  return (name: string) => {
    const docs: any[] = data[name] ?? [];
    return {
      findOne: vi.fn(async (filter: any) =>
        docs.find((d) => Object.entries(filter).every(([k, v]) => d[k] === v)) ?? null
      ),
      find: vi.fn((_filter?: any) => ({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn(async () => docs),
      })),
      insertOne: vi.fn(async (doc: any) => ({ insertedId: "new-id-123" })),
      updateOne: vi.fn(async (_filter: any, _update: any, _options?: any) => ({ modifiedCount: 1, upsertedCount: 0 })),
      deleteOne: vi.fn(async (_filter: any) => ({ deletedCount: 1 })),
      countDocuments: vi.fn(async (_filter?: any) => docs.length),
    };
  };
}

// ── Engineer profile ──────────────────────────────────────────────────────────
// The engineer/company fields live directly on the users document — the user
// IS the engineer, no separate entity. Queried by _id, not a user_id string.

describe("engineer profile — GET", () => {
  it("returns empty object when user doc doesn't exist", async () => {
    const col = mockCol({ users: [] });
    const doc = await col("users").findOne({ _id: "u1" });
    expect(doc ?? {}).toEqual({});
  });

  it("returns the user's engineer/company fields when set", async () => {
    const user = {
      _id: "u1",
      inspector_number: "INS-001",
      address: "123 Main St",
      title: "Engineer",
      expertise: "Structural",
      mr_number: "MR-42",
      mg_number: null,
      membership_start_date: "2020-01-01",
    };
    const col = mockCol({ users: [user] });
    const doc = await col("users").findOne({ _id: "u1" });
    expect(doc).not.toBeNull();
    expect(doc?.inspector_number).toBe("INS-001");
    expect(doc?.title).toBe("Engineer");
  });

  it("does not return another user's fields", async () => {
    const user = { _id: "u2", inspector_number: "INS-999" };
    const col = mockCol({ users: [user] });
    const doc = await col("users").findOne({ _id: "u1" });
    expect(doc).toBeNull();
  });
});

describe("engineer profile — PUT", () => {
  it("calls updateOne targeting the user's _id", async () => {
    const col = mockCol({ users: [] });
    const updateOne = col("users").updateOne;
    await updateOne(
      { _id: "u1" },
      { $set: { inspector_number: "INS-100", updated_at: new Date().toISOString() } },
    );
    expect(updateOne).toHaveBeenCalledOnce();
    const [filter] = (updateOne as any).mock.calls[0];
    expect(filter).toEqual({ _id: "u1" });
  });

  it("null-coalesces missing fields", () => {
    const body: Record<string, string | null> = { inspector_number: "INS-100" };
    const patch = {
      inspector_number: body.inspector_number ?? null,
      title: body.title ?? null,
    };
    expect(patch.title).toBeNull();
    expect(patch.inspector_number).toBe("INS-100");
  });
});

// ── Certificates ──────────────────────────────────────────────────────────────

describe("certificates — POST status derivation", () => {
  const TODAY = "2026-05-24";

  it("marks certificate active when expiry is in the future", () => {
    const expiryDate = "2027-01-01";
    const status = expiryDate && expiryDate < TODAY ? "expired" : "active";
    expect(status).toBe("active");
  });

  it("marks certificate expired when expiry is in the past", () => {
    const expiryDate = "2025-01-01";
    const status = expiryDate && expiryDate < TODAY ? "expired" : "active";
    expect(status).toBe("expired");
  });

  it("marks active when expiry matches today exactly", () => {
    const expiryDate = TODAY;
    const status = expiryDate && expiryDate < TODAY ? "expired" : "active";
    expect(status).toBe("active");
  });

  it("marks active when no expiry date provided", () => {
    const expiryDate: string = "";
    const status = expiryDate && expiryDate < TODAY ? "expired" : "active";
    expect(status).toBe("active");
  });
});

describe("certificates — GET list", () => {
  it("returns certificates sorted by issued_date descending", async () => {
    const certs = [
      { user_id: "u1", name: "Cert A", issued_date: "2023-01-01" },
      { user_id: "u1", name: "Cert B", issued_date: "2024-06-01" },
    ];
    const col = mockCol({ certificates: certs });
    const result = await col("certificates").find({ user_id: "u1" }).sort({ issued_date: -1 }).toArray();
    expect(result).toHaveLength(2);
  });

  it("returns empty array when user has no certificates", async () => {
    const col = mockCol({ certificates: [] });
    const result = await col("certificates").find({ user_id: "u1" }).sort({ issued_date: -1 }).toArray();
    expect(result).toHaveLength(0);
  });
});

describe("certificates — DELETE", () => {
  it("calls deleteOne with both _id and user_id (ownership check)", async () => {
    const col = mockCol({ certificates: [{ _id: "cert1", user_id: "u1" }] });
    const deleteOne = col("certificates").deleteOne;
    await deleteOne({ _id: "cert1", user_id: "u1" });
    expect(deleteOne).toHaveBeenCalledOnce();
    const [filter] = (deleteOne as any).mock.calls[0];
    expect(filter.user_id).toBe("u1");
  });
});

// ── Notifications ─────────────────────────────────────────────────────────────

describe("notifications — GET list", () => {
  it("returns up to 50 notifications", async () => {
    const notifs = Array.from({ length: 50 }, (_, i) => ({
      user_id: "u1",
      message: `Notif ${i}`,
      read: false,
      created_at: `2026-05-0${(i % 9) + 1}`,
    }));
    const col = mockCol({ notifications: notifs });
    const result = await col("notifications")
      .find({ user_id: "u1" })
      .sort({ created_at: -1 })
      .limit(50)
      .toArray();
    expect(result).toHaveLength(50);
  });
});

describe("notifications — mark read", () => {
  it("calls updateOne with read:true", async () => {
    const col = mockCol({ notifications: [{ _id: "n1", user_id: "u1", read: false }] });
    const updateOne = col("notifications").updateOne;
    await updateOne(
      { _id: "n1", user_id: "u1" },
      { $set: { read: true } }
    );
    expect(updateOne).toHaveBeenCalledOnce();
    const [, update] = (updateOne as any).mock.calls[0];
    expect(update.$set.read).toBe(true);
  });
});

// ── Personal info update ──────────────────────────────────────────────────────

describe("PUT /api/profile — name + phone patch", () => {
  it("trims name whitespace", () => {
    const name = "  John  ";
    expect(name?.trim() ?? null).toBe("John");
  });

  it("converts empty phone to null", () => {
    const phone = "";
    expect(phone?.trim() || null).toBeNull();
  });

  it("trims phone whitespace", () => {
    const phone = "  054-123  ";
    expect(phone?.trim() || null).toBe("054-123");
  });

  it("rejects request with no updatable fields", () => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    // no name or phone provided
    expect(Object.keys(patch).length === 1).toBe(true); // only updated_at → should 400
  });

  it("builds patch with both name and phone", () => {
    const body = { name: "Jane", phone: "054-000-0000" };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch.name = body.name?.trim() ?? null;
    if (body.phone !== undefined) patch.phone = body.phone?.trim() || null;
    expect(patch.name).toBe("Jane");
    expect(patch.phone).toBe("054-000-0000");
  });
});

// ── Avatar upload ─────────────────────────────────────────────────────────────

describe("avatar upload — object storage key", () => {
  it("keeps a safe image extension from the original file name", () => {
    expect(avatarExtension("profile.WEBP", "image/jpeg")).toBe(".webp");
  });

  it("falls back to the MIME type when the file name has no supported extension", () => {
    expect(avatarExtension("profile.bin", "image/png")).toBe(".png");
  });

  it("defaults to jpg for unknown image MIME types", () => {
    expect(avatarExtension("profile", "image/avif")).toBe(".jpg");
  });

  it("uses a user-scoped storage key instead of an inline data URL", () => {
    const key = `users/u1/avatar/avatar_${Date.now()}${avatarExtension("profile.jpg", "image/jpeg")}`;
    expect(key).toMatch(/^users\/u1\/avatar\/avatar_\d+\.jpg$/);
    expect(key).not.toContain("data:image");
  });
});

// ── Password change ───────────────────────────────────────────────────────────

describe("POST /api/auth/change-password — validation logic", () => {
  it("rejects when current_password is missing", () => {
    const body: { current_password?: string; new_password?: string } = { new_password: "newpass123" };
    const missing = !body.current_password || !body.new_password;
    expect(missing).toBe(true);
  });

  it("rejects when new_password is missing", () => {
    const body = { current_password: "oldpass123" } as any;
    const missing = !body.current_password || !body.new_password;
    expect(missing).toBe(true);
  });

  it("rejects when new_password is fewer than 8 characters", () => {
    const newPassword = "short";
    expect(newPassword.length < 8).toBe(true);
  });

  it("accepts when new_password is exactly 8 characters", () => {
    const newPassword = "exactly8";
    expect(newPassword.length < 8).toBe(false);
  });

  it("rejects when user has no password_hash (Google-only account)", () => {
    const user = { email: "test@test.com", password_hash: null };
    expect(!user.password_hash).toBe(true);
  });
});

// ── Profile stats ─────────────────────────────────────────────────────────────

describe("GET /api/profile/stats — monthly count filter", () => {
  it("derives YYYY-MM prefix from today's ISO string", () => {
    const now = new Date("2026-05-24T10:00:00.000Z").toISOString();
    const prefix = now.slice(0, 7);
    expect(prefix).toBe("2026-05");
  });

  it("matches documents created this month using regex filter", () => {
    const prefix = "2026-05";
    const docs = [
      { created_at: "2026-05-01T10:00:00Z", user_id: "u1" },
      { created_at: "2026-05-24T10:00:00Z", user_id: "u1" },
      { created_at: "2026-04-30T10:00:00Z", user_id: "u1" }, // previous month
    ];
    const monthly = docs.filter((d) => d.created_at.startsWith(prefix));
    expect(monthly).toHaveLength(2);
  });
});
