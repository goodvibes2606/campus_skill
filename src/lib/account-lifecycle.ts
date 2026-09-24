import { pool } from "@/lib/db";
import { AuthzError, ROLES, type AuthContext } from "@/lib/authz";

/**
 * Account lifecycle (Milestone 12).
 * States: pending | active | suspended | inactive | graduated | left | deactivated
 * Non-active profiles fail closed in getAuthContext (cannot use workspace).
 * Historical academic/placement/responsibility rows are never deleted.
 */

export const ACCOUNT_STATUSES = [
  "pending",
  "active",
  "suspended",
  "inactive",
  "graduated",
  "left",
  "deactivated",
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Roles that may change account lifecycle within their institution. */
const LIFECYCLE_ROLES = [ROLES.admin, ROLES.directorDean];

export async function setAccountStatus(
  ctx: AuthContext,
  targetUserId: string,
  status: AccountStatus,
  reason?: string
): Promise<{ id: string; status: string }> {
  if (!LIFECYCLE_ROLES.includes(ctx.roleName as never)) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only institution admin or Director/Dean may change account status"
    );
  }
  if (!ctx.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }
  if (!(ACCOUNT_STATUSES as readonly string[]).includes(status)) {
    throw new AuthzError("FORBIDDEN", "Invalid account status");
  }
  if (targetUserId === ctx.userId && status !== "active") {
    throw new AuthzError(
      "FORBIDDEN",
      "You cannot suspend or deactivate your own account"
    );
  }

  const target = await pool.query<{ institution_id: string | null; status: string }>(
    `SELECT institution_id, status FROM public.profiles WHERE id = $1`,
    [targetUserId]
  );
  const row = target.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Profile not found");
  }
  if (row.institution_id !== ctx.institutionId) {
    throw new AuthzError("FORBIDDEN", "Institution access denied");
  }

  // History-preserving: only profiles.status changes; enrollments etc. untouched.
  const updated = await pool.query<{ id: string; status: string }>(
    `UPDATE public.profiles SET status = $2, updated_at = now()
      WHERE id = $1 AND institution_id = $3
      RETURNING id, status`,
    [targetUserId, status, ctx.institutionId]
  );
  const out = updated.rows[0];
  if (!out) {
    throw new AuthzError("FORBIDDEN", "Profile update denied");
  }

  await pool.query(
    `INSERT INTO public.institution_config_audit
        (institution_id, changed_by, area, action, status, previous_value, new_value)
     VALUES ($1,$2,'account_lifecycle','status_change',$3,$4,$5)`,
    [
      ctx.institutionId,
      ctx.userId,
      status,
      JSON.stringify({ user_id: targetUserId, status: row.status }),
      JSON.stringify({
        user_id: targetUserId,
        status,
        reason: (reason || "").slice(0, 500),
      }),
    ]
  );

  return out;
}

export async function listAccounts(
  ctx: AuthContext,
  query: { status?: string; limit?: number } = {}
): Promise<{ id: string; full_name: string; email: string; status: string; role_name: string }[]> {
  if (!LIFECYCLE_ROLES.includes(ctx.roleName as never) && ctx.roleName !== ROLES.systemAdmin) {
    throw new AuthzError("FORBIDDEN", "Account directory not available for your role");
  }
  if (!ctx.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const params: unknown[] = [ctx.institutionId];
  let statusClause = "";
  if (query.status) {
    params.push(query.status);
    statusClause = `AND p.status = $${params.length}`;
  }
  params.push(limit);
  const result = await pool.query(
    `SELECT p.id, p.full_name, p.email, p.status, r.name AS role_name
       FROM public.profiles p
       JOIN public.roles r ON r.id = p.role_id
      WHERE p.institution_id = $1 ${statusClause}
      ORDER BY p.full_name
      LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

/** True if the status may perform normal active workspace operations. */
export function isActiveAccountStatus(status: string): boolean {
  return status === "active";
}
