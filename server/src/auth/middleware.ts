import {extractSessionIds, resolveSession} from "./session";
import type {User, UserRole} from "../../src/shared/types.js";
import {isAnyFeatureEnabledForUser} from "../features";
import {normalizePlanId} from "../plans/tierFeatures";
import type {NextFunction, Request, Response} from "express";

export interface AuthContext {
  /**
   * Effective user for data scoping. When an admin is viewing as another user
   * this is the impersonated user, so every `{ user_id: ctx.userId }` filter
   * follows the selection with no per-route changes.
   */
  userId: string;
  /**
   * The user the session belongs to. Role checks use this, so impersonating a
   * non-admin never strips the admin's own privileges.
   */
  user: User;
  /** The impersonated user, when an admin is viewing as someone else. */
  actingAs: User | null;
  /** The real (session-owning) user's id, regardless of impersonation. */
  realUserId: string;
}

export class HTTPException extends Error {
  constructor(public status: number, public override message: string) {
    super(message);
    this.name = "HTTPException";
  }
}

export async function requireAuth(cookieHeader: string | undefined): Promise<AuthContext> {
  if (extractSessionIds(cookieHeader).length === 0) throw new HTTPException(401, "No session cookie");

  const resolved = await resolveSession(cookieHeader);
  if (!resolved) throw new HTTPException(401, "Invalid or expired session");
  const {identity} = resolved;

  const { user, actingAs } = identity;
  if ((user as any).is_active === 0) throw new HTTPException(403, "User account is inactive");

  const realUserId = (user as any).id ?? (user as any)._id?.toString();
  return {
    userId: actingAs?.id ?? realUserId,
    user,
    actingAs,
    realUserId,
  };
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

export function requireAnyFeature(featureKeys: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let context: AuthContext;
    try {
      context = await requireAuth(req.headers.cookie);
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({error: err.message});
      return;
    }

    if (await isAnyFeatureEnabledForUser(context.userId, featureKeys)) {
      next();
      return;
    }

    res.status(403).json({
      error: "Feature disabled",
      status: 403,
      required_features: featureKeys,
    });
  };
}

/** Express middleware: require the session user to have at least `minRole`. */
export function requireMinRole(minRole: UserRole) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let context: AuthContext;
    try {
      context = await requireAuth(req.headers.cookie);
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({error: err.message});
      return;
    }

    try {
      requireRole(context, minRole);
      next();
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 403).json({error: err.message, status: err.status ?? 403});
    }
  };
}

/**
 * Restrict a route tree to an explicit set of plans.
 *
 * Distinct from requireMinRole: role is who the person is (admin, support),
 * plan is what the account bought. Gating a paid feature on role meant the plan
 * could not open it — an account on the right plan was still refused unless it
 * also happened to be an admin.
 *
 * A list rather than a minimum, because plans do not always form a ladder:
 * invoices are open to trial and business but not basic, which no threshold can
 * express.
 */
export function requirePlans(allowed: string[]) {
  const permitted = new Set(allowed.map((plan) => normalizePlanId(plan)));
  return async (req: Request, res: Response, next: NextFunction) => {
    let context: AuthContext;
    try {
      context = await requireAuth(req.headers.cookie);
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({error: err.message});
      return;
    }

    // Admins are not a plan, but they administer every account and would
    // otherwise be locked out of the pages they support.
    if (String(context.user.role ?? "").trim().toLowerCase() === "admin") {
      next();
      return;
    }

    const plan = normalizePlanId(context.user.plan ?? context.user.role);
    if (!permitted.has(plan)) {
      res.status(403).json({
        error: `This feature is available on the ${allowed.join(" and ")} plans`,
        status: 403,
        required_plans: allowed,
        current_plan: plan,
      });
      return;
    }
    next();
  };
}
