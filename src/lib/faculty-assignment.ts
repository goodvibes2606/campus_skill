import { pool } from "@/lib/db";
import {
  AuthzError,
  assertInstitution,
  type AuthContext,
} from "@/lib/authz";

/**
 * Faculty assignment services (Milestone 3).
 * Full chain: Faculty → Institution → Department → Program → Academic Year
 *           → Semester → Section → Subject → Subject Code (via subjects).
 * History-preserving: ending sets status + ended_at; rows are retained.
 */

export type FacultyAssignmentStatus = "active" | "ended" | "transferred";

export type FacultyAssignmentRow = {
  id: string;
  faculty_id: string;
  institution_id: string;
  department_id: string;
  program_id: string;
  academic_year_id: string;
  semester_id: string;
  section_id: string;
  subject_id: string;
  status: FacultyAssignmentStatus;
  assigned_at: Date;
  ended_at: Date | null;
  assigned_by: string | null;
};

export type FacultyAssignmentContext = FacultyAssignmentRow & {
  subject_name: string;
  subject_code: string;
  section_name: string;
  semester_number: number;
  academic_year_name: string;
  program_name: string;
  program_code: string;
  department_name: string;
  department_code: string;
};

type AssignParams = {
  facultyId: string;
  sectionId: string;
  subjectId: string;
  assignedBy?: string | null;
};

/**
 * Assign a faculty member to teach a subject in a section.
 * Syncs section_subjects.faculty_id (denormalized current pointer).
 * Caller must have authorized HOD/admin scope (see authz.assertCanAssignFaculty).
 */
export async function assignFaculty(
  ctx: AuthContext,
  params: AssignParams
): Promise<FacultyAssignmentContext> {
  const link = await loadSectionSubjectLink(params.sectionId, params.subjectId);
  if (!link) {
    throw new AuthzError(
      "FORBIDDEN",
      "Subject is not linked to this section"
    );
  }
  assertInstitution(ctx, link.institution_id);

  const faculty = await pool.query<{
    id: string;
    institution_id: string | null;
    role_name: string;
  }>(
    `SELECT p.id, p.institution_id, r.name AS role_name
       FROM public.profiles p
       JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = $1 AND p.status = 'active'`,
    [params.facultyId]
  );
  const facultyRow = faculty.rows[0];
  if (!facultyRow) {
    throw new AuthzError("FORBIDDEN", "Faculty profile not found or inactive");
  }
  if (facultyRow.role_name !== "faculty") {
    throw new AuthzError("FORBIDDEN", "Target profile is not faculty");
  }
  if (!facultyRow.institution_id) {
    throw new AuthzError("NO_INSTITUTION", "Faculty has no institution");
  }
  assertInstitution(ctx, facultyRow.institution_id);
  if (facultyRow.institution_id !== link.institution_id) {
    throw new AuthzError(
      "FORBIDDEN",
      "Faculty and section belong to different institutions"
    );
  }

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM public.faculty_assignments
      WHERE section_id = $1 AND subject_id = $2 AND status = 'active'`,
    [params.sectionId, params.subjectId]
  );
  if (existing.rows[0]) {
    throw new AuthzError(
      "FORBIDDEN",
      "Subject already has an active faculty assignment in this section"
    );
  }

  const inserted = await pool.query<FacultyAssignmentRow>(
    `INSERT INTO public.faculty_assignments (
        faculty_id, institution_id, department_id, program_id,
        academic_year_id, semester_id, section_id, subject_id,
        status, assigned_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
     RETURNING *`,
    [
      params.facultyId,
      link.institution_id,
      link.department_id,
      link.program_id,
      link.academic_year_id,
      link.semester_id,
      params.sectionId,
      params.subjectId,
      params.assignedBy ?? ctx.userId,
    ]
  );

  const row = inserted.rows[0];
  // Denormalized current pointer on section_subjects
  await pool.query(
    `UPDATE public.section_subjects
        SET faculty_id = $2
      WHERE section_id = $1 AND subject_id = $3`,
    [params.sectionId, params.facultyId, params.subjectId]
  );

  return hydrateAssignment(row);
}

/** End an active faculty assignment (history preserved). */
export async function endFacultyAssignment(
  ctx: AuthContext,
  assignmentId: string,
  status: Exclude<FacultyAssignmentStatus, "active">
): Promise<FacultyAssignmentContext> {
  const current = await pool.query<FacultyAssignmentRow>(
    `SELECT * FROM public.faculty_assignments WHERE id = $1`,
    [assignmentId]
  );
  const row = current.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Assignment not found");
  }
  assertInstitution(ctx, row.institution_id);
  if (row.status !== "active") {
    throw new AuthzError("FORBIDDEN", "Assignment is not active");
  }

  const updated = await pool.query<FacultyAssignmentRow>(
    `UPDATE public.faculty_assignments
        SET status = $2, ended_at = now()
      WHERE id = $1 AND status = 'active'
      RETURNING *`,
    [assignmentId, status]
  );
  const out = updated.rows[0];
  if (!out) {
    throw new AuthzError("FORBIDDEN", "Assignment already closed");
  }

  // Clear denormalized pointer only if no other active assignment remains
  const remaining = await pool.query(
    `SELECT 1 FROM public.faculty_assignments
      WHERE section_id = $1 AND subject_id = $2 AND status = 'active'`,
    [out.section_id, out.subject_id]
  );
  if (remaining.rows.length === 0) {
    await pool.query(
      `UPDATE public.section_subjects
          SET faculty_id = NULL
        WHERE section_id = $1 AND subject_id = $2`,
      [out.section_id, out.subject_id]
    );
  }

  return hydrateAssignment(out);
}

/** Active assignments for a faculty member. */
export async function getActiveFacultyAssignments(
  facultyId: string
): Promise<FacultyAssignmentContext[]> {
  const result = await pool.query<FacultyAssignmentRow>(
    `SELECT * FROM public.faculty_assignments
      WHERE faculty_id = $1 AND status = 'active'
      ORDER BY assigned_at DESC`,
    [facultyId]
  );
  return Promise.all(result.rows.map(hydrateAssignment));
}

/** Full assignment history for a faculty member (newest first). */
export async function listFacultyAssignments(
  ctx: AuthContext,
  facultyId: string
): Promise<FacultyAssignmentContext[]> {
  const result = await pool.query<FacultyAssignmentRow>(
    `SELECT * FROM public.faculty_assignments
      WHERE faculty_id = $1
      ORDER BY assigned_at DESC`,
    [facultyId]
  );
  const rows = result.rows.filter((r) => {
    try {
      assertInstitution(ctx, r.institution_id);
      return true;
    } catch {
      return false;
    }
  });
  return Promise.all(rows.map(hydrateAssignment));
}

/** Active assignments in a section (for roster views). */
export async function listSectionAssignments(
  ctx: AuthContext,
  sectionId: string
): Promise<FacultyAssignmentContext[]> {
  const result = await pool.query<FacultyAssignmentRow>(
    `SELECT * FROM public.faculty_assignments
      WHERE section_id = $1 AND status = 'active'
      ORDER BY assigned_at`,
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
  return Promise.all(rows.map(hydrateAssignment));
}

type SectionSubjectLink = {
  institution_id: string;
  department_id: string;
  program_id: string;
  academic_year_id: string;
  semester_id: string;
};

async function loadSectionSubjectLink(
  sectionId: string,
  subjectId: string
): Promise<SectionSubjectLink | null> {
  const result = await pool.query<SectionSubjectLink>(
    `SELECT s.institution_id,
            s.semester_id,
            ay.program_id,
            ay.id AS academic_year_id,
            p.department_id
       FROM public.sections s
       JOIN public.semesters sm ON sm.id = s.semester_id
       JOIN public.academic_years ay ON ay.id = sm.academic_year_id
       JOIN public.programs p ON p.id = ay.program_id
       JOIN public.section_subjects ss
         ON ss.section_id = s.id AND ss.subject_id = $2
      WHERE s.id = $1`,
    [sectionId, subjectId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    institution_id: row.institution_id,
    department_id: row.department_id,
    program_id: row.program_id,
    academic_year_id: row.academic_year_id,
    semester_id: row.semester_id,
  };
}

async function hydrateAssignment(
  row: FacultyAssignmentRow
): Promise<FacultyAssignmentContext> {
  const detail = await pool.query<{
    subject_name: string;
    subject_code: string;
    section_name: string;
    semester_number: number;
    academic_year_name: string;
    program_name: string;
    program_code: string;
    department_name: string;
    department_code: string;
  }>(
    `SELECT sub.name AS subject_name,
            sub.subject_code,
            sec.name AS section_name,
            sm.semester_number,
            ay.name AS academic_year_name,
            p.name AS program_name,
            p.code AS program_code,
            d.name AS department_name,
            d.code AS department_code
       FROM public.subjects sub
       JOIN public.sections sec ON sec.id = $2
       JOIN public.semesters sm ON sm.id = $3
       JOIN public.academic_years ay ON ay.id = $4
       JOIN public.programs p ON p.id = $5
       JOIN public.departments d ON d.id = $6
      WHERE sub.id = $1`,
    [
      row.subject_id,
      row.section_id,
      row.semester_id,
      row.academic_year_id,
      row.program_id,
      row.department_id,
    ]
  );
  const d = detail.rows[0];
  if (!d) {
    throw new Error(`Assignment hierarchy missing for ${row.id}`);
  }
  return { ...row, ...d };
}
