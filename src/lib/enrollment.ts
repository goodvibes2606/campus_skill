import { pool } from "@/lib/db";
import {
  AuthzError,
  assertInstitution,
  requireAuth,
  requireInstitution,
  type AuthContext,
} from "@/lib/authz";

/**
 * Student enrollment services (Milestone 3).
 * History-preserving: ending an enrollment sets status + ended_at;
 * rows are never hard-deleted.
 */

export type EnrollmentStatus =
  | "active"
  | "completed"
  | "dropped"
  | "transferred";

export type EnrollmentRow = {
  id: string;
  student_id: string;
  institution_id: string;
  program_id: string;
  academic_year_id: string;
  semester_id: string;
  section_id: string;
  status: EnrollmentStatus;
  enrolled_at: Date;
  ended_at: Date | null;
  enrolled_by: string | null;
};

export type EnrollmentContext = EnrollmentRow & {
  program_name: string;
  program_code: string;
  department_id: string;
  academic_year_name: string;
  semester_number: number;
  semester_name: string | null;
  section_name: string;
};

type EnrollParams = {
  studentId: string;
  sectionId: string;
  enrolledBy?: string | null;
};

/**
 * Enroll a student into a section (Program + Year + Semester + Section
 * are resolved from the section hierarchy). Requires an explicit
 * institution scope check by the caller via authorizeEnroll.
 */
export async function enrollStudent(
  ctx: AuthContext,
  params: EnrollParams
): Promise<EnrollmentContext> {
  const hierarchy = await loadSectionHierarchy(params.sectionId);
  if (!hierarchy) {
    throw new AuthzError("FORBIDDEN", "Section not found");
  }
  assertInstitution(ctx, hierarchy.institution_id);

  const student = await pool.query<{
    id: string;
    institution_id: string | null;
    role_name: string;
  }>(
    `SELECT p.id, p.institution_id, r.name AS role_name
       FROM public.profiles p
       JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = $1 AND p.status = 'active'`,
    [params.studentId]
  );
  const studentRow = student.rows[0];
  if (!studentRow) {
    throw new AuthzError("FORBIDDEN", "Student profile not found or inactive");
  }
  if (studentRow.role_name !== "student") {
    throw new AuthzError("FORBIDDEN", "Target profile is not a student");
  }
  if (!studentRow.institution_id) {
    throw new AuthzError("NO_INSTITUTION", "Student has no institution");
  }
  assertInstitution(ctx, studentRow.institution_id);
  if (studentRow.institution_id !== hierarchy.institution_id) {
    throw new AuthzError(
      "FORBIDDEN",
      "Student and section belong to different institutions"
    );
  }

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM public.student_enrollments
      WHERE student_id = $1 AND status = 'active'`,
    [params.studentId]
  );
  if (existing.rows[0]) {
    throw new AuthzError(
      "FORBIDDEN",
      "Student already has an active enrollment"
    );
  }

  const inserted = await pool.query<EnrollmentContext>(
    `INSERT INTO public.student_enrollments (
        student_id, institution_id, program_id, academic_year_id,
        semester_id, section_id, status, enrolled_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
     RETURNING *`,
    [
      params.studentId,
      hierarchy.institution_id,
      hierarchy.program_id,
      hierarchy.academic_year_id,
      hierarchy.semester_id,
      params.sectionId,
      params.enrolledBy ?? ctx.userId,
    ]
  );

  return hydrateEnrollment(inserted.rows[0]);
}

/** End an active enrollment (history preserved: status + ended_at). */
export async function endEnrollment(
  ctx: AuthContext,
  enrollmentId: string,
  status: Exclude<EnrollmentStatus, "active">
): Promise<EnrollmentContext> {
  const current = await pool.query<EnrollmentRow>(
    `SELECT * FROM public.student_enrollments WHERE id = $1`,
    [enrollmentId]
  );
  const row = current.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Enrollment not found");
  }
  assertInstitution(ctx, row.institution_id);

  if (row.status !== "active") {
    throw new AuthzError("FORBIDDEN", "Enrollment is not active");
  }

  const updated = await pool.query<EnrollmentRow>(
    `UPDATE public.student_enrollments
        SET status = $2,
            ended_at = now()
      WHERE id = $1 AND status = 'active'
      RETURNING *`,
    [enrollmentId, status]
  );
  const out = updated.rows[0];
  if (!out) {
    throw new AuthzError("FORBIDDEN", "Enrollment already closed");
  }
  return hydrateEnrollment(out);
}

/** Active enrollment for a student, or null. */
export async function getActiveEnrollment(
  studentId: string
): Promise<EnrollmentContext | null> {
  const result = await pool.query<EnrollmentRow>(
    `SELECT * FROM public.student_enrollments
      WHERE student_id = $1 AND status = 'active'
      LIMIT 1`,
    [studentId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return hydrateEnrollment(row);
}

/** Full enrollment history for a student (newest first). */
export async function listEnrollments(
  ctx: AuthContext,
  studentId: string
): Promise<EnrollmentContext[]> {
  const result = await pool.query<EnrollmentRow>(
    `SELECT * FROM public.student_enrollments
      WHERE student_id = $1
      ORDER BY enrolled_at DESC`,
    [studentId]
  );
  const rows = result.rows.filter((r) => {
    try {
      assertInstitution(ctx, r.institution_id);
      return true;
    } catch {
      return false;
    }
  });
  return Promise.all(rows.map(hydrateEnrollment));
}

/** Students actively enrolled in a section (scoped to caller institution). */
export async function listSectionStudents(
  ctx: AuthContext,
  sectionId: string
): Promise<EnrollmentContext[]> {
  requireInstitution(ctx);
  const result = await pool.query<EnrollmentRow>(
    `SELECT e.* FROM public.student_enrollments e
      WHERE e.section_id = $1 AND e.status = 'active'
      ORDER BY e.enrolled_at`,
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
  return Promise.all(rows.map(hydrateEnrollment));
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

async function hydrateEnrollment(row: EnrollmentRow): Promise<EnrollmentContext> {
  const detail = await pool.query<{
    program_name: string;
    program_code: string;
    department_id: string;
    academic_year_name: string;
    semester_number: number;
    semester_name: string | null;
    section_name: string;
  }>(
    `SELECT p.name AS program_name,
            p.code AS program_code,
            p.department_id,
            ay.name AS academic_year_name,
            sm.semester_number,
            sm.name AS semester_name,
            sec.name AS section_name
       FROM public.programs p
       JOIN public.academic_years ay ON ay.id = $2
       JOIN public.semesters sm ON sm.id = $3
       JOIN public.sections sec ON sec.id = $4
      WHERE p.id = $1`,
    [row.program_id, row.academic_year_id, row.semester_id, row.section_id]
  );
  const d = detail.rows[0];
  if (!d) {
    throw new Error(`Enrollment hierarchy missing for ${row.id}`);
  }
  return { ...row, ...d };
}

/** Convenience: require caller is a student and return active enrollment. */
export async function requireStudentEnrollment(
  ctx: AuthContext
): Promise<EnrollmentContext> {
  await requireAuth();
  if (ctx.roleName !== "student") {
    throw new AuthzError("FORBIDDEN", "Student role required");
  }
  const enrollment = await getActiveEnrollment(ctx.userId);
  if (!enrollment) {
    throw new AuthzError(
      "NO_INSTITUTION",
      "No active enrollment for this student"
    );
  }
  assertInstitution(ctx, enrollment.institution_id);
  return enrollment;
}
