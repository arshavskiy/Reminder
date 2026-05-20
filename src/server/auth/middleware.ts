import type { Database } from "bun:sqlite";
import { extractSessionFromCookie, verifySession } from "./session.js";
import type { User } from "../../shared/types.js";

export interface AuthContext {
  userId: number;
  user: User;
}

/**
 * Middleware: require authentication
 * Throws 401 if not authenticated
 */
export function requireAuth(
  db: Database,
  cookieHeader: string | undefined
): AuthContext {
  const sessionId = extractSessionFromCookie(cookieHeader);
  if (!sessionId) {
    throw new HTTPException(401, "No session cookie");
  }

  const user = verifySession(db, sessionId);
  if (!user) {
    throw new HTTPException(401, "Invalid or expired session");
  }

  if (user.is_active === 0) {
    throw new HTTPException(403, "User account is inactive");
  }

  return {
    userId: user.id,
    user,
  };
}

/**
 * Middleware: check if user is admin
 */
export function requireAdmin(context: AuthContext): void {
  if (context.user.role !== "admin") {
    throw new HTTPException(403, "Admin role required");
  }
}

/**
 * Safe HTTP exception for routing
 */
export class HTTPException extends Error {
  constructor(
    public status: number,
    public message: string
  ) {
    super(message);
    this.name = "HTTPException";
  }
}

/**
 * Convert HTTPException to response
 */
export function handleHTTPException(error: HTTPException): Response {
  return new Response(
    JSON.stringify({
      error: error.message,
      status: error.status,
    }),
    {
      status: error.status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

