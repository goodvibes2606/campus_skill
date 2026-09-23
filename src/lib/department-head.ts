import { pool } from "@/lib/db";
import {
  AuthzError,
  assertInstitution,
  type AuthContext,
} from "@/lib/authz";

/**
 * Department head (HOD) services (Milestone 3).
 * History-preserving handover: valid_to NULL = ACTIVE, else ENDED.
 */

export type DepartmentHeadRow = {
  id: string;
  department_id: string;
  hod_id: string;
  institution_id: string;
  assigned_by: string | null;
  valid_from: Date;
  valid_to: Date | null;
};

export type DepartmentHeadContext = DepartmentHeadRow & {
  hod_name: string;
  department_name: string;
  department_code: string;
  status: "ACTIVE" | "ENDED";
};

/**
 * Appoint (or hand over) the HOD for a department.
 * Closes any current head (ENDED), inserts new (ACTIVE). History preserved.
 */
export async function assignDepartmentHead(
  ctx: AuthContext,
  params: { departmentId: string; hodId: string }
): Promise<{
  previous: DepartmentHeadContext | null;
  current: DepartmentHeadContext;
}> {
  const dept = await pool.query<{
    id: string;
    institution_id: string;
    name: string;
    code: string;
  }>(
    `SELECT id, institution_id, name, code
       FROM public.departments WHERE id = $1`,
    [params.departmentId]
  );
  const department = dept.rows[0];
  if (!department) {
    throw new AuthzError("FORBIDDEN", "Department not found");
  }
  assertInstitution(ctx, department.institution_id);

  const hod = await pool.query<{
    id: string;
    institution_id: string | null;
    role_name: string;
  }>(
    `SELECT p.id, p.institution_id, r.name AS role_name
       FROM public.profiles p
       JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = $1 AND p.status = 'active'`,
    [params.hodId]
  );
  const hodRow = hod.rows[0];
  if (!hodRow) {
    throw new AuthzError("FORBIDDEN", "HOD profile not found or inactive");
  }
  if (hodRow.role_name !== "hod") {
    throw new AuthzError("FORBIDDEN", "Target profile is not an HOD");
  }
  if (!hodRow.institution_id) {
    throw new AuthzError("NO_INSTITUTION", "HOD has no institution");
  }
  assertInstitution(ctx, hodRow.institution_id);
  if (hodRow.institution_id !== department.institution_id) {
    throw new AuthzError(
      "FORBIDDEN",
      "HOD and department belong to different institutions"
    );
  }

  const closed = await pool.query<DepartmentHeadRow>(
    `UPDATE public.department_heads
        SET valid_to = now()
      WHERE department_id = $1 AND valid_to IS NULL
      RETURNING *`,
    [params.departmentId]
  );
  const previous = closed.rows[0]
    ? await hydrateHead(closed.rows[0])
    : null;

  const inserted = await pool.query<DepartmentHeadRow>(
    `INSERT INTO public.department_heads (
        department_id, hod_id, institution_id, assigned_by
     )
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      params.departmentId,
      params.hodId,
      department.institution_id,
      ctx.userId,
    ]
  );

  return {
    previous,
    current: await hydrateHead(inserted.rows[0]),
  };
}

/** Active HOD for a department, or null. */
export async function getActiveDepartmentHead(
  departmentId: string
): Promise<DepartmentHeadContext | null> {
  const result = await pool.query<DepartmentHeadRow>(
    `SELECT * FROM public.department_heads
      WHERE department_id = $1 AND valid_to IS NULL
      LIMIT 1`,
    [departmentId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return hydrateHead(row);
}

/** Departments where the profile is the current HOD. */
export async function listActiveHeadships(
  hodId: string
): Promise<DepartmentHeadContext[]> {
  const result = await pool.query<DepartmentHeadRow>(
    `SELECT * FROM public.department_heads
      WHERE hod_id = $1 AND valid_to IS NULL
      ORDER BY valid_from DESC`,
    [hodId]
  );
  return Promise.all(result.rows.map(hydrateHead));
}

/** Department head history (for a department), newest first. */
export async function listDepartmentHeadHistory(
  ctx: AuthContext,
  departmentId: string
): Promise<DepartmentHeadContext[]> {
  const result = await pool.query<DepartmentHeadRow>(
    `SELECT * FROM public.department_heads
      WHERE department_id = $1
      ORDER BY valid_from DESC`,
    [departmentId]
  );
  const rows = result.rows.filter((r) => {
    try {
      assertInstitution(ctx, r.institution_id);
      return true;
    } catch {
      return false;
    }
  });
  return Promise.all(rows.map(hydrateHead));
}

async function hydrateHead(
  row: DepartmentHeadRow
): Promise<DepartmentHeadContext> {
  const detail = await pool.query<{
    hod_name: string;
    department_name: string;
    department_code: string;
  }>(
    `SELECT p.full_name AS hod_name,
            d.name AS department_name,
            d.code AS department_code
       FROM public.departments d
       JOIN public.profiles p ON p.id = $2
      WHERE d.id = $1`,
    [row.department_id, row.hod_id]
  );
  const d = detail.rows[0];
  if (!d) {
    throw new Error(`Department head hierarchy missing for ${row.id}`);
  }
  return {
    ...row,
    ...d,
    status: row.valid_to === null ? "ACTIVE" : "ENDED",
  };
}
