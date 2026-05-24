import {describe, expect, it} from "vitest";
import type {AuthContext} from "../auth/middleware.js";
import {HTTPException, requireAdmin, requireRole} from "../auth/middleware.js";
import type {UserRole} from "../shared/types.js";

function makeCtx(role: UserRole): AuthContext {
  return {
    userId: "u1",
    user: { id: 1, google_sub: "", email: "test@test.com", name: null, phone: null, picture_url: null, role, is_active: 1, created_at: "", last_login_at: null },
  };
}

// ── requireRole ───────────────────────────────────────────────────────────────

describe("requireRole", () => {
  it("allows admin to access admin route", () => {
    expect(() => requireRole(makeCtx("admin"), "admin")).not.toThrow();
  });

  it("allows admin to access pro route", () => {
    expect(() => requireRole(makeCtx("admin"), "pro")).not.toThrow();
  });

  it("allows admin to access user route", () => {
    expect(() => requireRole(makeCtx("admin"), "user")).not.toThrow();
  });

  it("allows pro to access pro route", () => {
    expect(() => requireRole(makeCtx("pro"), "pro")).not.toThrow();
  });

  it("allows pro to access user route", () => {
    expect(() => requireRole(makeCtx("pro"), "user")).not.toThrow();
  });

  it("blocks pro from admin route", () => {
    expect(() => requireRole(makeCtx("pro"), "admin")).toThrow(HTTPException);
  });

  it("blocks user from admin route", () => {
    expect(() => requireRole(makeCtx("user"), "admin")).toThrow(HTTPException);
  });

  it("blocks user from pro route", () => {
    expect(() => requireRole(makeCtx("user"), "pro")).toThrow(HTTPException);
  });

  it("throws 403 status", () => {
    try {
      requireRole(makeCtx("user"), "admin");
    } catch (e) {
      expect(e).toBeInstanceOf(HTTPException);
      expect((e as HTTPException).status).toBe(403);
    }
  });
});

// ── requireAdmin (backwards compat) ──────────────────────────────────────────

describe("requireAdmin", () => {
  it("passes for admin", () => {
    expect(() => requireAdmin(makeCtx("admin"))).not.toThrow();
  });

  it("throws for pro", () => {
    expect(() => requireAdmin(makeCtx("pro"))).toThrow(HTTPException);
  });

  it("throws for user", () => {
    expect(() => requireAdmin(makeCtx("user"))).toThrow(HTTPException);
  });
});

// ── Role rank ordering ────────────────────────────────────────────────────────

describe("role hierarchy", () => {
  const ROLES: UserRole[] = ["user", "pro", "admin"];

  it("each role can access its own level", () => {
    for (const role of ROLES) {
      expect(() => requireRole(makeCtx(role), role)).not.toThrow();
    }
  });

  it("higher roles can access lower levels", () => {
    expect(() => requireRole(makeCtx("admin"), "pro")).not.toThrow();
    expect(() => requireRole(makeCtx("admin"), "user")).not.toThrow();
    expect(() => requireRole(makeCtx("pro"), "user")).not.toThrow();
  });

  it("lower roles cannot access higher levels", () => {
    expect(() => requireRole(makeCtx("user"), "pro")).toThrow();
    expect(() => requireRole(makeCtx("user"), "admin")).toThrow();
    expect(() => requireRole(makeCtx("pro"), "admin")).toThrow();
  });
});
