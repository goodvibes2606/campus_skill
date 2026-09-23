import { cache } from "react";

import { getSession } from "@/lib/session";
import { ensureProfile } from "@/lib/profile";
import { pool } from "@/lib/db";

/**
 * Server-side authorization foundation (Milestone 2).
 *
 * Role and institution are always loaded from public.profiles + public.roles
 * in the database — never trusted from the client or browser storage.
 * Milestone 3 can extend this with a larger permission matrix / RLS.
 */

/** Foundation role names (catalog lives in public.roles). */
export const ROLES = {
  student: "student",
  faculty: "faculty",
  admin: "admin",
  hod: "hod",
  directorDean: "director_dean",
  systemAdmin: "system_admin",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES] | (string & {});

export class AuthzError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NO_INSTITUTION";
  constructor(code: AuthzError["code"], message: string) {
    super(message);
    this.name = "AuthzError";
    this.code = code;
  }
}

export type AuthContext = {
  userId: string;
  roleId: string;
  roleName: string;
  institutionId: string | null;
  profileStatus: string;
  fullName: string;
  email: string;
};

type ContextRow = {
  id: string;
  role_id: string;
  role_name: string;
  institution_id: string | null;
  status: string;
  full_name: string;
  email: string;
};

/**
 * Load authenticated identity + role + institution from the database.
 * Returns null when there is no session or no active profile.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const session = await getSession();
  if (!session?.user) return null;

  await ensureProfile({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    image: session.user.image,
  });

  const result = await pool.query<ContextRow>(
    `SELECT p.id,
            p.role_id,
            r.name AS role_name,
            p.institution_id,
            p.status,
            p.full_name,
            p.email
       FROM public.profiles p
       JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = $1`,
    [session.user.id]
  );

  const row = result.rows[0];
  if (!row) return null;
  if (row.status !== "active") return null;

  return {
    userId: row.id,
    roleId: row.role_id,
    roleName: row.role_name,
    institutionId: row.institution_id,
    profileStatus: row.status,
    fullName: row.full_name,
    email: row.email,
  };
});

/** Require an active authenticated context (throws AuthzError otherwise). */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    throw new AuthzError("UNAUTHENTICATED", "Sign in required");
  }
  return ctx;
}

/** True if the context holds one of the given role names. */
export function hasRole(ctx: AuthContext, ...roles: RoleName[]): boolean {
  return roles.includes(ctx.roleName);
}

/** Assert one of the given roles; throws FORBIDDEN if not. */
export function requireRole(ctx: AuthContext, ...roles: RoleName[]): void {
  if (!hasRole(ctx, ...roles)) {
    throw new AuthzError(
      "FORBIDDEN",
      `Requires role: ${roles.join(" | ")} (has: ${ctx.roleName})`
    );
  }
}

/**
 * Institution isolation check.
 * - Users with no institution (pending) cannot access institution-scoped data.
 * - system_admin may access any institution (cross-institution operator).
 * - Everyone else: exact institution match only.
 */
export function canAccessInstitution(
  ctx: AuthContext,
  institutionId: string
): boolean {
  if (!institutionId) return false;
  if (ctx.roleName === ROLES.systemAdmin) return true;
  if (!ctx.institutionId) return false;
  return ctx.institutionId === institutionId;
}

/** Assert institution access; throws FORBIDDEN / NO_INSTITUTION. */
export function assertInstitution(
  ctx: AuthContext,
  institutionId: string
): void {
  if (!institutionId) {
    throw new AuthzError("FORBIDDEN", "Missing institution scope");
  }
  if (!ctx.institutionId && ctx.roleName !== ROLES.systemAdmin) {
    throw new AuthzError(
      "NO_INSTITUTION",
      "Profile has no institution assigned yet"
    );
  }
  if (!canAccessInstitution(ctx, institutionId)) {
    throw new AuthzError(
      "FORBIDDEN",
      "Institution access denied"
    );
  }
}

/** Require an active profile that belongs to an institution. */
export function requireInstitution(ctx: AuthContext): string {
  if (!ctx.institutionId) {
    throw new AuthzError(
      "NO_INSTITUTION",
      "Profile has no institution assigned yet"
    );
  }
  return ctx.institutionId;
}

/**
 * Foundation for academic-scope checks (Milestone 3 extends this).
 * Ensures a loaded academic entity belongs to the caller's institution.
 */
export function assertAcademicScope(
  ctx: AuthContext,
  entity: { institution_id: string | null | undefined }
): void {
  if (!entity.institution_id) {
    throw new AuthzError("FORBIDDEN", "Entity missing institution scope");
  }
  assertInstitution(ctx, entity.institution_id);
}

/**
 * Run a SQL query scoped to the caller's institution (application-level
 * isolation until RLS is added in a later milestone).
 */
export async function queryScopedToInstitution<T extends Record<string, unknown>>(
  ctx: AuthContext,
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const institutionId = requireInstitution(ctx);
  const result = await pool.query<T>(
    text,
    [...params, institutionId] as never[]
  );
  // Defense in depth: drop any row that somehow escaped the WHERE clause.
  return result.rows.filter(
    (row) =>
      row.institution_id === undefined ||
      row.institution_id === institutionId ||
      ctx.roleName === ROLES.systemAdmin
  );
}
