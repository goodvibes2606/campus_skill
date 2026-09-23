import { pool } from "@/lib/db";
import { AuthzError, ROLES, type AuthContext } from "@/lib/authz";
import { getAcademicScope } from "@/lib/academic-scope";
import { listVisibleAssignments, type AssignmentView } from "@/lib/assignments";
import { listVisibleResources, type AcademicResourceView } from "@/lib/resources";
import { listVisibleSyllabi, listUnits, listTopics, type SyllabusView, type SyllabusUnitRow, type SyllabusTopicRow } from "@/lib/syllabus";
import { listMsts, type MstView } from "@/lib/mst";
import { listQuestionPapers, type QuestionPaperView } from "@/lib/question-bank";
import { listNotifications, type NotificationView } from "@/lib/notifications";

/**
 * Student academic workspace (Milestone 8).
 *
 * Server-side only: enrolled subjects and subject workspaces are derived from
 * the student's active enrollment → section → section_subjects. URL subject
 * IDs are validated against that set before any content loads.
 */

export type EnrolledSubject = {
  id: string;
  name: string;
  subject_code: string;
  faculty_name: string | null;
  faculty_id: string | null;
};

export type OwnSubmissionSummary = {
  id: string;
  assignment_id: string;
  attempt_number: number;
  status: "draft" | "submitted" | "returned" | "graded";
  score: number | null;
  max_points_snapshot: number | null;
  feedback: string;
  submitted_at: Date | null;
};

export type SubjectWorkspace = {
  subject: EnrolledSubject;
  assignments: (AssignmentView & { my_submission: OwnSubmissionSummary | null })[];
  resources: AcademicResourceView[];
  syllabi: (SyllabusView & {
    units: (SyllabusUnitRow & { topics: SyllabusTopicRow[] })[];
  })[];
  msts: MstView[];
  papers: QuestionPaperView[];
  ownSubmissions: OwnSubmissionSummary[];
  pendingCount: number;
};

const ACADEMIC_NOTIFICATION_PREFIXES = [
  "assignment.",
  "syllabus.",
  "calendar.",
  "mst.",
  "paper.",
  "resource.",
  "notification.",
];

function isAcademicNotification(event: string): boolean {
  return ACADEMIC_NOTIFICATION_PREFIXES.some((p) => event.startsWith(p));
}

/** Recipient-only notifications, academic events first (stable within recency). */
export function prioritizeAcademicNotifications(
  rows: NotificationView[]
): NotificationView[] {
  return [...rows].sort((a, b) => {
    const aAc = isAcademicNotification(a.event) ? 0 : 1;
    const bAc = isAcademicNotification(b.event) ? 0 : 1;
    if (aAc !== bAc) return aAc - bAc;
    const aTime = a.created_at instanceof Date ? a.created_at.getTime() : 0;
    const bTime = b.created_at instanceof Date ? b.created_at.getTime() : 0;
    return bTime - aTime;
  });
}

async function requireActiveStudentEnrollment(ctx: AuthContext) {
  if (ctx.roleName !== ROLES.student) {
    throw new AuthzError("FORBIDDEN", "Student role required");
  }
  const scope = await getAcademicScope(ctx);
  const enr = scope.enrollment;
  if (!enr || enr.status !== "active") {
    throw new AuthzError("FORBIDDEN", "No active enrollment");
  }
  return enr;
}

/** Subjects linked to the student's active enrollment section. */
export async function listEnrolledSubjects(
  ctx: AuthContext
): Promise<{ subjects: EnrolledSubject[]; enrollment: Awaited<ReturnType<typeof requireActiveStudentEnrollment>> | null }> {
  if (ctx.roleName !== ROLES.student) {
    return { subjects: [], enrollment: null };
  }
  const scope = await getAcademicScope(ctx);
  const enr = scope.enrollment;
  if (!enr || enr.status !== "active") {
    return { subjects: [], enrollment: null };
  }

  const result = await pool.query<{
    id: string;
    name: string;
    subject_code: string;
    faculty_name: string | null;
    faculty_id: string | null;
  }>(
    `SELECT sub.id, sub.name, sub.subject_code,
            p.full_name AS faculty_name, ss.faculty_id
       FROM public.section_subjects ss
       JOIN public.subjects sub ON sub.id = ss.subject_id
       LEFT JOIN public.profiles p ON p.id = ss.faculty_id
      WHERE ss.section_id = $1 AND ss.status = 'active'
      ORDER BY sub.subject_code ASC`,
    [enr.section_id]
  );

  return { subjects: result.rows, enrollment: enr };
}

/** Latest own submission per assignment (student-only, server-scoped). */
export async function listOwnSubmissions(
  ctx: AuthContext,
  opts: { subjectId?: string } = {}
): Promise<OwnSubmissionSummary[]> {
  if (ctx.roleName !== ROLES.student) return [];
  const enr = await requireActiveStudentEnrollment(ctx);

  const params: unknown[] = [ctx.userId, enr.section_id];
  let subjectClause = "";
  if (opts.subjectId) {
    params.push(opts.subjectId);
    subjectClause = `AND a.subject_id = $${params.length}`;
  }

  const result = await pool.query<{
    id: string;
    assignment_id: string;
    attempt_number: number;
    status: OwnSubmissionSummary["status"];
    score: number | null;
    max_points_snapshot: number | null;
    feedback: string;
    submitted_at: Date | null;
  }>(
    `SELECT DISTINCT ON (s.assignment_id)
            s.id, s.assignment_id, s.attempt_number, s.status, s.score,
            s.max_points_snapshot, s.feedback, s.submitted_at
       FROM public.assignment_submissions s
       JOIN public.assignments a ON a.id = s.assignment_id
      WHERE s.student_id = $1
        AND a.section_id = $2
        ${subjectClause}
      ORDER BY s.assignment_id, s.attempt_number DESC, s.updated_at DESC`,
    params
  );
  return result.rows;
}

/**
 * Load one subject workspace for the enrolled student.
 * Throws AuthzError if the subject is not linked to the active section.
 */
export async function loadSubjectWorkspace(
  ctx: AuthContext,
  subjectId: string
): Promise<SubjectWorkspace> {
  const enr = await requireActiveStudentEnrollment(ctx);

  const link = await pool.query<{
    id: string;
    name: string;
    subject_code: string;
    faculty_name: string | null;
    faculty_id: string | null;
  }>(
    `SELECT sub.id, sub.name, sub.subject_code,
            p.full_name AS faculty_name, ss.faculty_id
       FROM public.section_subjects ss
       JOIN public.subjects sub ON sub.id = ss.subject_id
       LEFT JOIN public.profiles p ON p.id = ss.faculty_id
      WHERE ss.section_id = $1
        AND ss.subject_id = $2
        AND ss.status = 'active'`,
    [enr.section_id, subjectId]
  );
  const subject = link.rows[0];
  if (!subject) {
    throw new AuthzError(
      "FORBIDDEN",
      "Subject is not part of your enrolled section"
    );
  }

  const [assignments, resources, syllabi, msts, papers, ownSubmissions] =
    await Promise.all([
      listVisibleAssignments(ctx, { subjectId, limit: 50 }),
      listVisibleResources(ctx, { subjectId, status: "published", limit: 50 }),
      listVisibleSyllabi(ctx, { subjectId, status: "published", limit: 10 }),
      listMsts(ctx, { subjectId, limit: 20 }),
      listQuestionPapers(ctx, { subjectId, status: "published", limit: 20 }),
      listOwnSubmissions(ctx, { subjectId }),
    ]);

  const submissionByAssignment = new Map(
    ownSubmissions.map((s) => [s.assignment_id, s])
  );

  const pendingCount = assignments.filter((a) => {
    const sub = submissionByAssignment.get(a.id);
    if (!sub) return true;
    return sub.status === "draft" || sub.status === "returned";
  }).length;

  const syllabiWithUnits = await Promise.all(
    syllabi.map(async (s) => {
      const units = await listUnits(ctx, s.id);
      const unitsWithTopics = await Promise.all(
        units.map(async (u) => ({
          ...u,
          topics: await listTopics(ctx, u.id),
        }))
      );
      return { ...s, units: unitsWithTopics };
    })
  );

  return {
    subject,
    assignments: assignments.map((a) => ({
      ...a,
      my_submission: submissionByAssignment.get(a.id) ?? null,
    })),
    resources,
    syllabi: syllabiWithUnits,
    msts,
    papers,
    ownSubmissions,
    pendingCount,
  };
}

/** Enrich visible assignments with the student's own submission (one query). */
export async function attachOwnSubmissions(
  ctx: AuthContext,
  assignments: AssignmentView[]
): Promise<(AssignmentView & { my_submission: OwnSubmissionSummary | null })[]> {
  if (ctx.roleName !== ROLES.student || assignments.length === 0) {
    return assignments.map((a) => ({ ...a, my_submission: null }));
  }
  const own = await listOwnSubmissions(ctx);
  const byAssignment = new Map(own.map((s) => [s.assignment_id, s]));
  return assignments.map((a) => ({
    ...a,
    my_submission: byAssignment.get(a.id) ?? null,
  }));
}

/** Recent recipient-only notifications (academic-first ordering). */
export async function listStudentNotifications(
  ctx: AuthContext,
  limit = 8
): Promise<NotificationView[]> {
  const rows = await listNotifications(ctx, { limit: Math.min(limit, 50) });
  return prioritizeAcademicNotifications(rows);
}
