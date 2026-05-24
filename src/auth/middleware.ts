import {extractSessionFromCookie, verifySession} from "./session";
import type {User, UserRole} from "../../src/shared/types.js";

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

const ROLE_RANK: Record<UserRole, number> = { user: 0, pro: 1, admin: 2 };

/** Throws 403 if the authenticated user's role is below the required minimum. */
export function requireRole(context: AuthContext, minRole: UserRole): void {
  const userRank = ROLE_RANK[context.user.role as UserRole] ?? 0;
  const minRank = ROLE_RANK[minRole] ?? 0;
  if (userRank < minRank) {
    throw new HTTPException(403, `Role '${minRole}' or higher required`);
  }
}

/** Convenience — kept for backwards compat with existing callers. */
export function requireAdmin(context: AuthContext): void {
  requireRole(context, "admin");
}

export function handleHTTPException(error: HTTPException) {
  return { status: error.status, body: { error: error.message, status: error.status } };
}
