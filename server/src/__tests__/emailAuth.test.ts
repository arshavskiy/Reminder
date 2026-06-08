import {describe, expect, it} from "vitest";
import {generateToken, hashPassword, verifyPassword} from "../auth/emailAuth.js";
import {handleHTTPException, HTTPException} from "../auth/middleware.js";

// ── hashPassword / verifyPassword ────────────────────────────────────────────

describe("hashPassword / verifyPassword", () => {
  it("produces a bcrypt hash", async () => {
    const hash = await hashPassword("mysecretpassword");
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("correcthorsebatterystaple");
    expect(await verifyPassword("correcthorsebatterystaple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correcthorsebatterystaple");
    expect(await verifyPassword("wrongpassword", hash)).toBe(false);
  });

  it("produces a different hash each call (bcrypt salting)", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });

  it("both hashes still verify against the same password", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(await verifyPassword("same", h1)).toBe(true);
    expect(await verifyPassword("same", h2)).toBe(true);
  }, 15000);
});

// ── generateToken ─────────────────────────────────────────────────────────────

describe("generateToken", () => {
  it("returns a 64-character hex string", () => {
    const token = generateToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateToken()));
    expect(tokens.size).toBe(20);
  });
});

// ── HTTPException / handleHTTPException ──────────────────────────────────────

describe("HTTPException", () => {
  it("carries status and message", () => {
    const e = new HTTPException(401, "Unauthorized");
    expect(e.status).toBe(401);
    expect(e.message).toBe("Unauthorized");
  });

  it("is an instance of Error", () => {
    expect(new HTTPException(403, "Forbidden")).toBeInstanceOf(Error);
  });

  it("has name HTTPException", () => {
    expect(new HTTPException(404, "Not found").name).toBe("HTTPException");
  });
});

describe("handleHTTPException", () => {
  it("returns the status and body from the exception", () => {
    const e = new HTTPException(403, "Admin role required");
    const r = handleHTTPException(e);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("Admin role required");
    expect(r.body.status).toBe(403);
  });
});
