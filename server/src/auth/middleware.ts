import { extractSessionFromCookie, verifySession } from "./session";
import type { User } from "../../src/shared/types.js";

export interface AuthContext {
  userId: string;
  user: User;
}

export class HTTPException extends Error {
  constructor(public status: number, public override message: string) {
    super(message);
    this.name = "HTTPException";
  }
}

export async function requireAuth(cookieHeader: string | undefined): Promise<AuthContext> {
  const sessionId = extractSessionFromCookie(cookieHeader);
  if (!sessionId) throw new HTTPException(401, "No session cookie");

  const user = await verifySession(sessionId);
  if (!user) throw new HTTPException(401, "Invalid or expired session");
  if ((user as any).is_active === 0) throw new HTTPException(403, "User account is inactive");

  return { userId: (user as any).id ?? (user as any)._id?.toString(), user };
}

export function requireAdmin(context: AuthContext): void {
  if (context.user.role !== "admin") throw new HTTPException(403, "Admin role required");
}

export function handleHTTPException(error: HTTPException) {
  return { status: error.status, body: { error: error.message, status: error.status } };
}
