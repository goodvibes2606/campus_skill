import { pool } from "@/lib/db";
import {
  AuthzError,
  assertInstitution,
  type AuthContext,
} from "@/lib/authz";

/**
 * Class coordinator services (Milestone 3).
 * Assign + handover with full history preservation.
 * Old assignment → ENDED (valid_to set); new assignment → ACTIVE (valid_to NULL).
 * sections.coordinator_id is denormalized current pointer only.
 */

export type CoordinatorRow = {
  id: string;
  section_id: string;
  coordinator_id: string;
  institution_id: string;
  assigned_by: string | null;
  valid_from: Date;
  valid_to: Date | null;
};

export type CoordinatorContext = CoordinatorRow & {
  coordinator_name: string;
  coordinator_email: string;
  section_name: string;
  program_id: string;
  department_id: string;
  academic_year_id: string;
  semester_id: string;
  status: "ACTIVE" | "ENDED";
};

type AssignParams = {
  sectionId: string;
  coordinatorId: string;
};

/**
 * Assign (or hand over) the class coordinator for a section.
 * Section already scopes Program + Academic Year + Semester + Section.
 *
 * Handover protocol:
 *  1. Close current active row → valid_to = now() (ENDED)
 *  2. Insert new active row → valid_to NULL (ACTIVE)
 *  3. Update sections.coordinator_id pointer
 * History rows are never overwritten or deleted.
 */
export async function assignCoordinator(
  ctx: AuthContext,
  params: AssignParams
): Promise<{ previous: CoordinatorContext | null; current: CoordinatorContext }> {
  const hierarchy = await loadSectionHierarchy(params.sectionId);
  if (!hierarchy) {
    throw new AuthzError("FORBIDDEN", "Section not found");
  }
  assertInstitution(ctx, hierarchy.institution_id);

  const coordinator = await pool.query<{
    id: string;
    institution_id: string | null;
    role_name: string;
  }>(
    `SELECT p.id, p.institution_id, r.name AS role_name
       FROM public.profiles p
       JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = $1 AND p.status = 'active'`,
    [params.coordinatorId]
  );
  const coordRow = coordinator.rows[0];
  if (!coordRow) {
    throw new AuthzError(
      "FORBIDDEN",
      "Coordinator profile not found or inactive"
    );
  }
  if (!["faculty", "hod", "admin"].includes(coordRow.role_name)) {
    throw new AuthzError(
      "FORBIDDEN",
      "Coordinator must be faculty, HOD, or admin"
    );
  }
  if (!coordRow.institution_id) {
    throw new AuthzError("NO_INSTITUTION", "Coordinator has no institution");
  }
  assertInstitution(ctx, coordRow.institution_id);
  if (coordRow.institution_id !== hierarchy.institution_id) {
    throw new AuthzError(
      "FORBIDDEN",
      "Coordinator and section belong to different institutions"
    );
  }

  // Close current active assignment (if any) — history preserved
  const closed = await pool.query<CoordinatorRow>(
    `UPDATE public.section_coordinators
        SET valid_to = now()
      WHERE section_id = $1 AND valid_to IS NULL
      RETURNING *`,
    [params.sectionId]
  );
  const previousRow = closed.rows[0] ?? null;
  const previous = previousRow
    ? await hydrateCoordinator(previousRow)
    : null;

  // Insert new ACTIVE assignment
  const inserted = await pool.query<CoordinatorRow>(
    `INSERT INTO public.section_coordinators (
        section_id, coordinator_id, institution_id, assigned_by
     )
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      params.sectionId,
      params.coordinatorId,
      hierarchy.institution_id,
      ctx.userId,
    ]
  );
  const current = await hydrateCoordinator(inserted.rows[0]);

  // Denormalized current pointer
  await pool.query(
    `UPDATE public.sections SET coordinator_id = $2 WHERE id = $1`,
    [params.sectionId, params.coordinatorId]
  );

  return { previous, current };
}

/** Current active coordinator for a section, or null. */
export async function getActiveCoordinator(
  sectionId: string
): Promise<CoordinatorContext | null> {
  const result = await pool.query<CoordinatorRow>(
    `SELECT * FROM public.section_coordinators
      WHERE section_id = $1 AND valid_to IS NULL
      LIMIT 1`,
    [sectionId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return hydrateCoordinator(row);
}

/**
 * Coordinator history for a section (newest first).
 * Includes ENDED rows — never deleted.
 */
export async function listCoordinatorHistory(
  ctx: AuthContext,
  sectionId: string
): Promise<CoordinatorContext[]> {
  const result = await pool.query<CoordinatorRow>(
    `SELECT * FROM public.section_coordinators
      WHERE section_id = $1
      ORDER BY valid_from DESC`,
    [sectionId]
  );
  const rows = result.rows.filter((r) => {
    try {
      assertInstitution(ctx, r.institution_id);
      return true;
    } catch {
      return false;
    }
  });
  return Promise.all(rows.map(hydrateCoordinator));
}

/** Sections where the given profile is the current coordinator. */
export async function listCoordinatedSections(
  ctx: AuthContext,
  profileId: string
): Promise<CoordinatorContext[]> {
  const result = await pool.query<CoordinatorRow>(
    `SELECT * FROM public.section_coordinators
      WHERE coordinator_id = $1 AND valid_to IS NULL
      ORDER BY valid_from DESC`,
    [profileId]
  );
  const rows = result.rows.filter((r) => {
    try {
      assertInstitution(ctx, r.institution_id);
      return true;
    } catch {
      return false;
    }
  });
  return Promise.all(rows.map(hydrateCoordinator));
}

type SectionHierarchy = {
  institution_id: string;
  program_id: string;
  academic_year_id: string;
  semester_id: string;
  department_id: string;
};

async function loadSectionHierarchy(
  sectionId: string
): Promise<SectionHierarchy | null> {
  const result = await pool.query<SectionHierarchy>(
    `SELECT s.institution_id,
            s.semester_id,
            ay.program_id,
            ay.id AS academic_year_id,
            p.department_id
       FROM public.sections s
       JOIN public.semesters sm ON sm.id = s.semester_id
       JOIN public.academic_years ay ON ay.id = sm.academic_year_id
       JOIN public.programs p ON p.id = ay.program_id
      WHERE s.id = $1`,
    [sectionId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    institution_id: row.institution_id,
    program_id: row.program_id,
    academic_year_id: row.academic_year_id,
    semester_id: row.semester_id,
    department_id: row.department_id,
  };
}

async function hydrateCoordinator(row: CoordinatorRow): Promise<CoordinatorContext> {
  const detail = await pool.query<{
    coordinator_name: string;
    coordinator_email: string;
    section_name: string;
    program_id: string;
    department_id: string;
    academic_year_id: string;
    semester_id: string;
  }>(
    `SELECT p.full_name AS coordinator_name,
            p.email AS coordinator_email,
            sec.name AS section_name,
            ay.program_id,
            d.id AS department_id,
            ay.id AS academic_year_id,
            sm.id AS semester_id
       FROM public.sections sec
       JOIN public.semesters sm ON sm.id = sec.semester_id
       JOIN public.academic_years ay ON ay.id = sm.academic_year_id
       JOIN public.programs pr ON pr.id = ay.program_id
       JOIN public.departments d ON d.id = pr.department_id
       JOIN public.profiles p ON p.id = $2
      WHERE sec.id = $1`,
    [row.section_id, row.coordinator_id]
  );
  const d = detail.rows[0];
  if (!d) {
    throw new Error(`Coordinator hierarchy missing for ${row.id}`);
  }
  return {
    ...row,
    ...d,
    status: row.valid_to === null ? "ACTIVE" : "ENDED",
  };
}
