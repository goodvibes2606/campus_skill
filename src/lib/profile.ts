import { pool } from "@/lib/db";

/**
 * Initial role name applied at first profile bootstrap.
 * This is a default assignment only — not a permanent architectural lock-in.
 * The profiles.role_id FK points at public.roles and can be changed later
 * by the institutional approval / RBAC system.
 */
export const DEFAULT_ROLE_NAME = "student";

export type AuthUserLike = {
  id: string;
  name?: string | null;
  email: string;
  emailVerified?: boolean;
  image?: string | null;
};

async function getDefaultRoleId(): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM public.roles WHERE name = $1 AND is_active = true LIMIT 1`,
    [DEFAULT_ROLE_NAME]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * First-login profile bootstrap: ensure a public.profiles row exists
 * linked to auth.user.id. Idempotent. Does not invent an institution —
 * institution_id stays NULL (pending) until assigned by admin/RBAC.
 * Does not overwrite an existing role_id or institution_id on re-login.
 */
export async function ensureProfile(user: AuthUserLike): Promise<void> {
  const roleId = await getDefaultRoleId();
  if (!roleId) {
    throw new Error(
      `Default role "${DEFAULT_ROLE_NAME}" not found in public.roles. Run migration 001.`
    );
  }

  // Never resurrect a deliberately removed profile.
  const existing = await pool.query<{ status: string }>(
    `SELECT status FROM public.profiles WHERE id = $1`,
    [user.id]
  );
  if (existing.rows[0] && existing.rows[0].status === "deactivated") {
    return;
  }

  await pool.query(
    `INSERT INTO public.profiles (id, email, full_name, avatar_url, role_id, institution_id, status)
     VALUES ($1, $2, $3, $4, $5, NULL, 'active')
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       full_name = EXCLUDED.full_name,
       avatar_url = EXCLUDED.avatar_url,
       updated_at = now()
     WHERE public.profiles.email = EXCLUDED.email
        OR public.profiles.full_name IS DISTINCT FROM EXCLUDED.full_name
        OR public.profiles.avatar_url IS DISTINCT FROM EXCLUDED.avatar_url`,
    [
      user.id,
      user.email,
      user.name?.trim() || user.email,
      user.image ?? null,
      roleId,
    ]
  );
}

export type ProfileRow = {
  id: string;
  institution_id: string | null;
  role_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

export async function getProfileById(userId: string): Promise<ProfileRow | null> {
  const result = await pool.query<ProfileRow>(
    `SELECT id, institution_id, role_id, full_name, email, avatar_url, status, created_at, updated_at
     FROM public.profiles
     WHERE id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}
