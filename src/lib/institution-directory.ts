import { pool } from "@/lib/db";
import { AuthzError, type AuthContext } from "@/lib/authz";
import {
  assertCanReadInstitutionWorkspace,
  getInstitutionWorkspaceScope,
} from "@/lib/institution-scope";

/**
 * Institution users & roles (Milestone 11 foundation).
 * Read-only directory for Institution Control Center — no role mutation
 * UI in M11 (documented: role changes remain a future RBAC admin flow).
 */

export type InstitutionUserRow = {
  id: string;
  full_name: string;
  email: string;
  status: string;
  role_name: string;
  department_name: string | null;
  created_at: Date;
};

export type InstitutionStructureCounts = {
  universities: number;
  departments: number;
  programs: number;
  academicYears: number;
  semesters: number;
  sections: number;
  subjects: number;
  activeProfiles: number;
  byRole: { role_name: string; count: number }[];
};

export async function listInstitutionUsers(
  ctx: AuthContext,
  query: { search?: string; role?: string; limit?: number } = {}
): Promise<InstitutionUserRow[]> {
  const scope = await getInstitutionWorkspaceScope(ctx);
  assertCanReadInstitutionWorkspace(scope);
  if (!scope.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }

  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const params: unknown[] = [scope.institutionId];
  const clauses: string[] = [];

  if (query.search) {
    params.push(`%${query.search}%`);
    clauses.push(`(p.full_name ILIKE $${params.length} OR p.email ILIKE $${params.length})`);
  }
  if (query.role) {
    params.push(query.role);
    clauses.push(`r.name = $${params.length}`);
  }
  params.push(limit);

  const where = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
  const result = await pool.query<InstitutionUserRow>(
    `SELECT p.id, p.full_name, p.email, p.status, r.name AS role_name,
            d.name AS department_name, p.created_at
       FROM public.profiles p
       JOIN public.roles r ON r.id = p.role_id
       LEFT JOIN public.department_heads dh ON dh.hod_id = p.id AND dh.valid_to IS NULL
       LEFT JOIN public.departments d ON d.id = dh.department_id
      WHERE p.institution_id = $1 ${where}
      ORDER BY p.full_name
      LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

export async function loadInstitutionStructure(
  ctx: AuthContext
): Promise<InstitutionStructureCounts> {
  const scope = await getInstitutionWorkspaceScope(ctx);
  assertCanReadInstitutionWorkspace(scope);
  if (!scope.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }
  const id = scope.institutionId;

  const [counts, roles] = await Promise.all([
    pool.query<{
      universities: string;
      departments: string;
      programs: string;
      academic_years: string;
      semesters: string;
      sections: string;
      subjects: string;
      active_profiles: string;
    }>(
      `SELECT
         (SELECT count(*) FROM public.universities WHERE institution_id = $1) AS universities,
         (SELECT count(*) FROM public.departments WHERE institution_id = $1) AS departments,
         (SELECT count(*) FROM public.programs WHERE institution_id = $1) AS programs,
         (SELECT count(*) FROM public.academic_years WHERE institution_id = $1) AS academic_years,
         (SELECT count(*) FROM public.semesters WHERE institution_id = $1) AS semesters,
         (SELECT count(*) FROM public.sections WHERE institution_id = $1) AS sections,
         (SELECT count(*) FROM public.subjects WHERE institution_id = $1) AS subjects,
         (SELECT count(*) FROM public.profiles WHERE institution_id = $1 AND status = 'active') AS active_profiles`,
      [id]
    ),
    pool.query<{ role_name: string; count: string }>(
      `SELECT r.name AS role_name, count(*)::text AS count
         FROM public.profiles p
         JOIN public.roles r ON r.id = p.role_id
        WHERE p.institution_id = $1 AND p.status = 'active'
        GROUP BY r.name
        ORDER BY r.name`,
      [id]
    ),
  ]);

  const c = counts.rows[0];
  return {
    universities: Number(c?.universities ?? 0),
    departments: Number(c?.departments ?? 0),
    programs: Number(c?.programs ?? 0),
    academicYears: Number(c?.academic_years ?? 0),
    semesters: Number(c?.semesters ?? 0),
    sections: Number(c?.sections ?? 0),
    subjects: Number(c?.subjects ?? 0),
    activeProfiles: Number(c?.active_profiles ?? 0),
    byRole: roles.rows.map((r) => ({
      role_name: r.role_name,
      count: Number(r.count),
    })),
  };
}
