import { cache } from "react";

import { pool } from "@/lib/db";
import {
  AuthzError,
  assertInstitution,
  requireInstitution,
  ROLES,
  type AuthContext,
} from "@/lib/authz";
import {
  getActiveEnrollment,
  type EnrollmentContext,
} from "@/lib/enrollment";
import {
  getActiveFacultyAssignments,
  type FacultyAssignmentContext,
} from "@/lib/faculty-assignment";
import {
  listActiveHeadships,
  type DepartmentHeadContext,
} from "@/lib/department-head";
import {
  listCoordinatedSections,
  type CoordinatorContext,
} from "@/lib/coordinator";

/**
 * Academic scope helpers (Milestone 3).
 *
 * Boundary rules:
 * - Students operate only within their active enrollment context.
 * - Faculty operate only within their active faculty assignments.
 * - HOD operate only within departments they currently head (+ institution).
 * - system_admin / admin retain broader institution-level access (documented).
 */

export type AcademicScope = {
  userId: string;
  roleName: string;
  institutionId: string | null;
  enrollment: EnrollmentContext | null;
  facultyAssignments: FacultyAssignmentContext[];
  headships: DepartmentHeadContext[];
  coordinatorSections: CoordinatorContext[];
};

/** Load full academic scope for the authenticated user (per request). */
export const getAcademicScope = cache(
  async (ctx: AuthContext): Promise<AcademicScope> => {
    const isStudent = ctx.roleName === ROLES.student;
    const isFaculty =
      ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod;
    const wantsHeadships = ctx.roleName === ROLES.hod;

    const enrollment = isStudent
      ? await getActiveEnrollment(ctx.userId)
      : null;

    const facultyAssignments =
      ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod
        ? await getActiveFacultyAssignments(ctx.userId)
        : [];

    const headships = wantsHeadships
      ? await listActiveHeadships(ctx.userId)
      : [];

    const coordinatorSections =
      ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod
        ? await listCoordinatedSections(ctx, ctx.userId)
        : [];

    // Silence unused for non-faculty roles (kept for clarity of intent)
    void isFaculty;

    return {
      userId: ctx.userId,
      roleName: ctx.roleName,
      institutionId: ctx.institutionId,
      enrollment,
      facultyAssignments,
      headships,
      coordinatorSections,
    };
  }
);

// ---------------------------------------------------------------------------
// Student boundaries
// ---------------------------------------------------------------------------

/**
 * Assert the caller (student) may operate inside the given enrollment.
 * Students may only access their own active enrollment.
 */
export function assertStudentEnrollment(
  ctx: AuthContext,
  enrollment: Pick<EnrollmentContext, "student_id" | "institution_id" | "status">
): void {
  if (ctx.roleName !== ROLES.student) {
    throw new AuthzError("FORBIDDEN", "Student role required");
  }
  if (enrollment.student_id !== ctx.userId) {
    throw new AuthzError(
      "FORBIDDEN",
      "Students may only access their own enrollment"
    );
  }
  assertInstitution(ctx, enrollment.institution_id);
  if (enrollment.status !== "active") {
    throw new AuthzError("FORBIDDEN", "Enrollment is not active");
  }
}

/**
 * Assert the caller may read/operate on a section in the student's
 * academic context (must match the student's active enrollment section).
 */
export function assertWithinStudentSection(
  ctx: AuthContext,
  enrollment: EnrollmentContext,
  sectionId: string
): void {
  assertStudentEnrollment(ctx, enrollment);
  if (enrollment.section_id !== sectionId) {
    throw new AuthzError(
      "FORBIDDEN",
      "Section is outside the student's enrolled context"
    );
  }
}

// ---------------------------------------------------------------------------
// Faculty boundaries
// ---------------------------------------------------------------------------

/**
 * True if the faculty context has an active assignment covering the
 * given section (and optionally subject).
 */
export function facultyCoversSection(
  assignments: FacultyAssignmentContext[],
  sectionId: string,
  subjectId?: string
): boolean {
  return assignments.some(
    (a) =>
      a.status === "active" &&
      a.section_id === sectionId &&
      (subjectId === undefined || a.subject_id === subjectId)
  );
}

/** Assert faculty may operate in a section (and optionally a subject). */
export function assertFacultyAssignmentScope(
  ctx: AuthContext,
  assignments: FacultyAssignmentContext[],
  target: { sectionId: string; subjectId?: string; institutionId?: string }
): void {
  if (ctx.roleName !== ROLES.faculty && ctx.roleName !== ROLES.hod) {
    throw new AuthzError("FORBIDDEN", "Faculty role required");
  }
  if (target.institutionId) {
    assertInstitution(ctx, target.institutionId);
  }
  if (
    !facultyCoversSection(
      assignments,
      target.sectionId,
      target.subjectId
    )
  ) {
    throw new AuthzError(
      "FORBIDDEN",
      "No active faculty assignment covers this section/subject"
    );
  }
}

// ---------------------------------------------------------------------------
// HOD boundaries (department + institution scoped)
// ---------------------------------------------------------------------------

/** Department IDs the HOD currently heads. */
export function activeHeadshipDepartmentIds(
  headships: DepartmentHeadContext[]
): string[] {
  return headships
    .filter((h) => h.status === "ACTIVE" && h.valid_to === null)
    .map((h) => h.department_id);
}

/** Assert the HOD currently heads the given department. */
export function assertHodDepartment(
  ctx: AuthContext,
  headships: DepartmentHeadContext[],
  departmentId: string
): void {
  if (ctx.roleName !== ROLES.hod) {
    throw new AuthzError("FORBIDDEN", "HOD role required");
  }
  requireInstitution(ctx);
  if (!activeHeadshipDepartmentIds(headships).includes(departmentId)) {
    throw new AuthzError(
      "FORBIDDEN",
      "HOD is not authorized for this department"
    );
  }
}

/**
 * Resolve a section → department_id and assert HOD may act on it.
 * Also enforces institution isolation.
 */
export async function assertHodMayManageSection(
  ctx: AuthContext,
  headships: DepartmentHeadContext[],
  sectionId: string
): Promise<{ departmentId: string; institutionId: string }> {
  if (ctx.roleName !== ROLES.hod && ctx.roleName !== ROLES.admin && ctx.roleName !== ROLES.systemAdmin) {
    throw new AuthzError(
      "FORBIDDEN",
      "HOD, admin, or system_admin required"
    );
  }

  const result = await pool.query<{
    department_id: string;
    institution_id: string;
  }>(
    `SELECT p.department_id, s.institution_id
       FROM public.sections s
       JOIN public.semesters sm ON sm.id = s.semester_id
       JOIN public.academic_years ay ON ay.id = sm.academic_year_id
       JOIN public.programs p ON p.id = ay.program_id
      WHERE s.id = $1`,
    [sectionId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Section not found");
  }
  assertInstitution(ctx, row.institution_id);

  if (ctx.roleName === ROLES.hod) {
    assertHodDepartment(ctx, headships, row.department_id);
  }

  return {
    departmentId: row.department_id,
    institutionId: row.institution_id,
  };
}

/**
 * Assert the caller may assign faculty to a subject in a department.
 * HOD must head that department; admin/system_admin pass after institution check.
 */
export async function assertCanAssignFaculty(
  ctx: AuthContext,
  target: { sectionId: string; subjectId?: string }
): Promise<{ departmentId: string; institutionId: string }> {
  const scope = await getAcademicScope(ctx);
  const resolved = await assertHodMayManageSection(
    ctx,
    scope.headships,
    target.sectionId
  );

  if (target.subjectId) {
    const subject = await pool.query<{
      institution_id: string;
      program_id: string;
      department_id: string;
    }>(
      `SELECT s.institution_id, s.program_id, p.department_id
         FROM public.subjects s
         JOIN public.programs p ON p.id = s.program_id
        WHERE s.id = $1`,
      [target.subjectId]
    );
    const sub = subject.rows[0];
    if (!sub) {
      throw new AuthzError("FORBIDDEN", "Subject not found");
    }
    assertInstitution(ctx, sub.institution_id);
    if (sub.department_id !== resolved.departmentId) {
      throw new AuthzError(
        "FORBIDDEN",
        "Subject does not belong to the authorized department"
      );
    }
  }

  return resolved;
}

/**
 * Assert the caller may assign/hand over a class coordinator for a section.
 * HOD must head the section's department; admin/system_admin allowed after
 * institution isolation.
 */
export async function assertCanAssignCoordinator(
  ctx: AuthContext,
  sectionId: string
): Promise<{ departmentId: string; institutionId: string }> {
  const headships =
    ctx.roleName === ROLES.hod
      ? await listActiveHeadships(ctx.userId)
      : [];
  return assertHodMayManageSection(ctx, headships, sectionId);
}

/**
 * Assert the caller may enroll a student into a section.
 * Allowed: admin, system_admin, HOD of section's department,
 * or current coordinator of the section.
 */
export async function assertCanEnrollStudent(
  ctx: AuthContext,
  sectionId: string
): Promise<{ departmentId: string; institutionId: string }> {
  const headships =
    ctx.roleName === ROLES.hod
      ? await listActiveHeadships(ctx.userId)
      : [];
  const resolved = await assertHodMayManageSection(ctx, headships, sectionId);

  if (
    ctx.roleName === ROLES.admin ||
    ctx.roleName === ROLES.systemAdmin ||
    ctx.roleName === ROLES.hod
  ) {
    return resolved;
  }

  if (ctx.roleName === ROLES.faculty) {
    const coord = await pool.query(
      `SELECT 1 FROM public.section_coordinators
        WHERE section_id = $1 AND coordinator_id = $2 AND valid_to IS NULL`,
      [sectionId, ctx.userId]
    );
    if (coord.rows.length > 0) return resolved;
  }

  throw new AuthzError(
    "FORBIDDEN",
    "Only admin, HOD, or the section coordinator may enroll students"
  );
}
