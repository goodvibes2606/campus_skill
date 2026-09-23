import { pool } from "@/lib/db";
import {
  AuthzError,
  assertInstitution,
  ROLES,
  type AuthContext,
} from "@/lib/authz";
import { getAcademicScope } from "@/lib/academic-scope";
import {
  AssessmentValidationError,
  canTransitionAssignment,
  isAssignmentStatus,
  isSubmissionStatus,
  type AssignmentStatus,
} from "@/lib/assessment-types";

/**
 * Course assignments + student submissions (Milestone 6).
 *
 * Visibility:
 * - Student → published/closed assignments in active enrollment
 *             (section + subject + program/year/semester); own submissions only.
 * - Faculty → own + active teaching assignment (section+subject); reviews own
 *             assignment submissions in scope.
 * - HOD → headed departments (all statuses).
 * - Admin / system_admin → institution / cross-institution.
 *
 * Submission history: one row per attempt; never hard-deleted.
 * Students cannot read another student's submission (server-side).
 */

export type AssignmentRow = {
  id: string;
  institution_id: string;
  university_id: string;
  department_id: string;
  program_id: string;
  academic_year_id: string;
  semester_id: string;
  section_id: string;
  subject_id: string;
  owner_id: string;
  created_by: string;
  title: string;
  description: string;
  instructions: string;
  status: AssignmentStatus;
  due_at: Date | null;
  max_points: number | null;
  allow_resubmit: boolean;
  version: number;
  published_by: string | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type AssignmentView = AssignmentRow & {
  subject_name: string;
  subject_code: string;
  section_name: string;
  academic_year_name: string;
  semester_number: number;
  owner_name: string;
  is_owner: boolean;
  submission_count: number;
};

export type SubmissionRow = {
  id: string;
  assignment_id: string;
  institution_id: string;
  section_id: string;
  subject_id: string;
  student_id: string;
  attempt_number: number;
  status: "draft" | "submitted" | "returned" | "graded";
  content_text: string;
  content_note: string;
  submitted_at: Date | null;
  returned_at: Date | null;
  score: number | null;
  max_points_snapshot: number | null;
  feedback: string;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type SubmissionView = SubmissionRow & {
  student_name: string;
  assignment_title: string;
  is_student: boolean;
};

const SELECT_ASSIGNMENT = `
  SELECT a.*,
         sub.name AS subject_name,
         sub.subject_code,
         sec.name AS section_name,
         ay.name AS academic_year_name,
         sm.semester_number,
         o.full_name AS owner_name,
         (
           SELECT count(*)::int
             FROM public.assignment_submissions s
            WHERE s.assignment_id = a.id
         ) AS submission_count
    FROM public.assignments a
    JOIN public.subjects sub ON sub.id = a.subject_id
    JOIN public.sections sec ON sec.id = a.section_id
    JOIN public.semesters sm ON sm.id = a.semester_id
    JOIN public.academic_years ay ON ay.id = a.academic_year_id
    JOIN public.profiles o ON o.id = a.owner_id
`;

async function buildAssignmentFilter(
  ctx: AuthContext,
  query: { status?: string; sectionId?: string; subjectId?: string }
): Promise<{ where: string; params: unknown[] }> {
  const params: unknown[] = [];
  const parts: string[] = [];
  const push = (sql: string, ...values: unknown[]) => {
    const start = params.length + 1;
    params.push(...values);
    let i = start;
    parts.push(sql.replace(/\?/g, () => `$${i++}`));
  };

  if (query.status && isAssignmentStatus(query.status)) {
    push(`a.status = ?`, query.status);
  }
  if (query.sectionId) {
    push(`a.section_id = ?::uuid`, query.sectionId);
  }
  if (query.subjectId) {
    push(`a.subject_id = ?::uuid`, query.subjectId);
  }

  if (ctx.roleName === ROLES.systemAdmin) {
    // any institution
  } else if (ctx.roleName === ROLES.admin) {
    push(`a.institution_id = ?::uuid`, ctx.institutionId);
  } else if (ctx.roleName === ROLES.student) {
    const scope = await getAcademicScope(ctx);
    const enr = scope.enrollment;
    if (!enr || enr.status !== "active") {
      push(`FALSE`);
    } else {
      push(`a.institution_id = ?::uuid`, enr.institution_id);
      push(`a.section_id = ?::uuid`, enr.section_id);
      push(`a.program_id = ?::uuid`, enr.program_id);
      push(`a.academic_year_id = ?::uuid`, enr.academic_year_id);
      push(`a.semester_id = ?::uuid`, enr.semester_id);
      push(`(a.status IN ('published','closed') OR a.owner_id = ?::uuid)`, ctx.userId);
    }
  } else if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    push(`a.institution_id = ?::uuid`, ctx.institutionId);
    const ors: string[] = [];
    const start = params.length + 1;
    let i = start;
    ors.push(`a.owner_id = $${i++}`);
    params.push(ctx.userId);
    for (const assign of scope.facultyAssignments) {
      if (assign.status !== "active") continue;
      ors.push(`(a.section_id = $${i++} AND a.subject_id = $${i++})`);
      params.push(assign.section_id, assign.subject_id);
    }
    if (ctx.roleName === ROLES.hod) {
      for (const h of scope.headships) {
        if (h.status !== "ACTIVE" || h.valid_to !== null) continue;
        ors.push(`a.department_id = $${i++}`);
        params.push(h.department_id);
      }
    }
    parts.push(`(${ors.join(" OR ")})`);
  } else {
    push(`a.institution_id = ?::uuid`, ctx.institutionId);
    push(`a.status IN ('published','closed')`);
  }

  return {
    where: parts.length ? `WHERE ${parts.join(" AND ")}` : "",
    params,
  };
}

export type ListAssignmentsQuery = {
  status?: string;
  sectionId?: string;
  subjectId?: string;
  limit?: number;
};

export async function listVisibleAssignments(
  ctx: AuthContext,
  query: ListAssignmentsQuery = {}
): Promise<AssignmentView[]> {
  const filter = await buildAssignmentFilter(ctx, query);
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const result = await pool.query<AssignmentView>(
    `${SELECT_ASSIGNMENT} ${filter.where}
     ORDER BY a.due_at NULLS LAST, a.updated_at DESC
     LIMIT ${limit}`,
    filter.params as never[]
  );
  return result.rows.map((row) => ({
    ...row,
    is_owner: row.owner_id === ctx.userId || row.created_by === ctx.userId,
  }));
}

async function loadAssignmentRow(id: string): Promise<AssignmentRow | null> {
  const r = await pool.query<AssignmentRow>(
    `SELECT * FROM public.assignments WHERE id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function assertCanAccessAssignment(
  ctx: AuthContext,
  assignmentId: string
): Promise<AssignmentRow> {
  const row = await loadAssignmentRow(assignmentId);
  if (!row) throw new AuthzError("FORBIDDEN", "Assignment not found");

  if (ctx.roleName === ROLES.systemAdmin) return row;
  if (ctx.roleName === ROLES.admin) {
    assertInstitution(ctx, row.institution_id);
    return row;
  }
  if (ctx.roleName === ROLES.student) {
    const scope = await getAcademicScope(ctx);
    const enr = scope.enrollment;
    if (!enr || enr.status !== "active") {
      throw new AuthzError("FORBIDDEN", "No active enrollment");
    }
    if (row.institution_id !== enr.institution_id) {
      throw new AuthzError("FORBIDDEN", "Institution access denied");
    }
    if (
      row.section_id !== enr.section_id ||
      row.program_id !== enr.program_id ||
      row.academic_year_id !== enr.academic_year_id ||
      row.semester_id !== enr.semester_id
    ) {
      throw new AuthzError(
        "FORBIDDEN",
        "Assignment outside student academic context"
      );
    }
    if (
      row.status !== "published" &&
      row.status !== "closed" &&
      row.owner_id !== ctx.userId &&
      row.created_by !== ctx.userId
    ) {
      throw new AuthzError("FORBIDDEN", "Assignment not published");
    }
    return row;
  }
  if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod) {
    assertInstitution(ctx, row.institution_id);
    if (row.owner_id === ctx.userId || row.created_by === ctx.userId) return row;
    const scope = await getAcademicScope(ctx);
    const covers = scope.facultyAssignments.some(
      (a) =>
        a.status === "active" &&
        a.section_id === row.section_id &&
        a.subject_id === row.subject_id
    );
    if (covers) return row;
    if (ctx.roleName === ROLES.hod) {
      const heads = scope.headships.some(
        (h) =>
          h.status === "ACTIVE" &&
          h.valid_to === null &&
          h.department_id === row.department_id
      );
      if (heads) return row;
    }
    if (row.status === "published" || row.status === "closed") return row;
    throw new AuthzError(
      "FORBIDDEN",
      "No teaching assignment covers this assignment"
    );
  }
  assertInstitution(ctx, row.institution_id);
  if (row.status !== "published" && row.status !== "closed") {
    throw new AuthzError("FORBIDDEN", "Assignment not published");
  }
  return row;
}

async function resolveAssignmentScope(sectionId: string, subjectId: string) {
  const result = await pool.query<{
    institution_id: string;
    university_id: string;
    department_id: string;
    program_id: string;
    academic_year_id: string;
    semester_id: string;
    subject_program_id: string;
  }>(
    `SELECT s.institution_id,
            s.semester_id,
            ay.program_id,
            ay.id AS academic_year_id,
            p.department_id,
            d.university_id,
            sub.program_id AS subject_program_id
       FROM public.sections s
       JOIN public.semesters sm ON sm.id = s.semester_id
       JOIN public.academic_years ay ON ay.id = sm.academic_year_id
       JOIN public.programs p ON p.id = ay.program_id
       JOIN public.departments d ON d.id = p.department_id
       JOIN public.subjects sub ON sub.id = $2
      WHERE s.id = $1`,
    [sectionId, subjectId]
  );
  const row = result.rows[0];
  if (!row) throw new AuthzError("FORBIDDEN", "Section/subject not found");
  if (row.subject_program_id !== row.program_id) {
    throw new AuthzError(
      "FORBIDDEN",
      "Subject does not belong to this section program"
    );
  }
  return row;
}

/** Faculty only within active assignment (section+subject); HOD dept; admin inst. */
export async function assertCanCreateAssignment(
  ctx: AuthContext,
  target: { sectionId: string; subjectId: string }
): Promise<void> {
  const scopeRow = await resolveAssignmentScope(
    target.sectionId,
    target.subjectId
  );
  assertInstitution(ctx, scopeRow.institution_id);

  if (
    ctx.roleName === ROLES.admin ||
    ctx.roleName === ROLES.systemAdmin ||
    ctx.roleName === ROLES.directorDean
  ) {
    return;
  }

  if (ctx.roleName === ROLES.hod || ctx.roleName === ROLES.faculty) {
    const scope = await getAcademicScope(ctx);
    if (ctx.roleName === ROLES.hod) {
      const heads = scope.headships.some(
        (h) =>
          h.status === "ACTIVE" &&
          h.valid_to === null &&
          h.department_id === scopeRow.department_id
      );
      if (heads) return;
    }
    const teaches = scope.facultyAssignments.some(
      (a) =>
        a.status === "active" &&
        a.section_id === target.sectionId &&
        a.subject_id === target.subjectId
    );
    if (teaches) return;
    const coord = scope.coordinatorSections.some(
      (c) => c.section_id === target.sectionId
    );
    if (coord) return;
    throw new AuthzError(
      "FORBIDDEN",
      "No active teaching assignment covers this section/subject"
    );
  }

  throw new AuthzError(
    "FORBIDDEN",
    "Only faculty, HOD, or admin may create assignments"
  );
}

export type CreateAssignmentInput = {
  sectionId: string;
  subjectId: string;
  title: string;
  description?: string;
  instructions?: string;
  dueAt?: string | null;
  maxPoints?: number | null;
  allowResubmit?: boolean;
  status?: string;
};

export async function createAssignment(
  ctx: AuthContext,
  input: CreateAssignmentInput
): Promise<AssignmentView> {
  const title = (input.title || "").trim();
  if (title.length < 2 || title.length > 200) {
    throw new AssessmentValidationError("Title must be 2–200 characters");
  }
  await assertCanCreateAssignment(ctx, {
    sectionId: input.sectionId,
    subjectId: input.subjectId,
  });
  const scopeRow = await resolveAssignmentScope(
    input.sectionId,
    input.subjectId
  );

  let status: AssignmentStatus = "draft";
  if (input.status !== undefined) {
    if (!isAssignmentStatus(input.status)) {
      throw new AssessmentValidationError("Invalid status");
    }
    if (input.status !== "draft" && input.status !== "published") {
      throw new AssessmentValidationError(
        "New assignments may only be draft or published"
      );
    }
    status = input.status;
  }

  let dueAt: Date | null = null;
  if (input.dueAt) {
    const parsed = new Date(input.dueAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new AssessmentValidationError("dueAt must be a valid timestamp");
    }
    dueAt = parsed;
  }

  const maxPoints =
    input.maxPoints === null || input.maxPoints === undefined
      ? null
      : Number(input.maxPoints);
  if (maxPoints !== null && (!Number.isFinite(maxPoints) || maxPoints <= 0)) {
    throw new AssessmentValidationError("maxPoints must be > 0");
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO public.assignments (
        institution_id, university_id, department_id, program_id,
        academic_year_id, semester_id, section_id, subject_id,
        owner_id, created_by, title, description, instructions,
        status, due_at, max_points, allow_resubmit,
        published_by, published_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id`,
    [
      scopeRow.institution_id,
      scopeRow.university_id,
      scopeRow.department_id,
      scopeRow.program_id,
      scopeRow.academic_year_id,
      scopeRow.semester_id,
      input.sectionId,
      input.subjectId,
      ctx.userId,
      ctx.userId,
      title,
      (input.description || "").trim().slice(0, 4000),
      (input.instructions || "").trim().slice(0, 4000),
      status,
      dueAt,
      maxPoints,
      input.allowResubmit === true,
      status === "published" ? ctx.userId : null,
      status === "published" ? new Date() : null,
    ]
  );

  return getAssignmentView(ctx, inserted.rows[0].id);
}

export async function getAssignmentView(
  ctx: AuthContext,
  id: string
): Promise<AssignmentView> {
  await assertCanAccessAssignment(ctx, id);
  const view = await pool.query<AssignmentView>(
    `${SELECT_ASSIGNMENT} WHERE a.id = $1`,
    [id]
  );
  const out = view.rows[0];
  if (!out) throw new AuthzError("FORBIDDEN", "Assignment not found");
  return {
    ...out,
    is_owner: out.owner_id === ctx.userId || out.created_by === ctx.userId,
  };
}

async function assertCanManageAssignment(
  ctx: AuthContext,
  row: AssignmentRow
): Promise<void> {
  if (row.owner_id === ctx.userId || row.created_by === ctx.userId) return;
  if (
    ctx.roleName === ROLES.admin ||
    ctx.roleName === ROLES.systemAdmin ||
    ctx.roleName === ROLES.directorDean
  ) {
    return;
  }
  if (ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    if (
      scope.headships.some(
        (h) =>
          h.status === "ACTIVE" &&
          h.valid_to === null &&
          h.department_id === row.department_id
      )
    ) {
      return;
    }
  }
  throw new AuthzError(
    "FORBIDDEN",
    "Only owner, HOD, or admin may manage this assignment"
  );
}

export type UpdateAssignmentInput = {
  title?: string;
  description?: string;
  instructions?: string;
  status?: string;
  dueAt?: string | null;
  maxPoints?: number | null;
  allowResubmit?: boolean;
};

export async function updateAssignment(
  ctx: AuthContext,
  id: string,
  input: UpdateAssignmentInput
): Promise<AssignmentView> {
  const row = await assertCanAccessAssignment(ctx, id);
  await assertCanManageAssignment(ctx, row);

  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (col: string, val: unknown) => {
    values.push(val);
    fields.push(`${col} = $${values.length}`);
  };

  const contentTouched =
    input.title !== undefined ||
    input.description !== undefined ||
    input.instructions !== undefined ||
    input.dueAt !== undefined ||
    input.maxPoints !== undefined ||
    input.allowResubmit !== undefined;

  if (contentTouched) {
    if (row.status === "archived") {
      throw new AssessmentValidationError(
        "Reopen assignment before editing content"
      );
    }
    if (input.title !== undefined) {
      const t = input.title.trim();
      if (t.length < 2 || t.length > 200) {
        throw new AssessmentValidationError("Title must be 2–200 characters");
      }
      set("title", t);
      fields.push(`version = version + 1`);
    }
    if (input.description !== undefined) {
      set("description", input.description.trim().slice(0, 4000));
      fields.push(`version = version + 1`);
    }
    if (input.instructions !== undefined) {
      set("instructions", input.instructions.trim().slice(0, 4000));
      fields.push(`version = version + 1`);
    }
    if (input.dueAt !== undefined) {
      if (input.dueAt === null || input.dueAt === "") {
        set("due_at", null);
      } else {
        const parsed = new Date(input.dueAt);
        if (Number.isNaN(parsed.getTime())) {
          throw new AssessmentValidationError("dueAt invalid");
        }
        set("due_at", parsed);
      }
    }
    if (input.maxPoints !== undefined) {
      if (input.maxPoints === null) {
        set("max_points", null);
      } else {
        const n = Number(input.maxPoints);
        if (!Number.isFinite(n) || n <= 0) {
          throw new AssessmentValidationError("maxPoints must be > 0");
        }
        set("max_points", n);
      }
    }
    if (input.allowResubmit !== undefined) {
      set("allow_resubmit", input.allowResubmit === true);
    }
  }

  if (input.status !== undefined) {
    if (!isAssignmentStatus(input.status)) {
      throw new AssessmentValidationError("Invalid status");
    }
    const to = input.status;
    if (to !== row.status) {
      if (!canTransitionAssignment(row.status, to)) {
        throw new AssessmentValidationError(
          `Invalid assignment transition ${row.status} → ${to}`
        );
      }
      set("status", to);
      if (to === "published") {
        set("published_by", ctx.userId);
        set("published_at", new Date());
      } else if (to === "draft") {
        set("published_by", null);
        set("published_at", null);
      }
    }
  }

  if (fields.length === 0) return getAssignmentView(ctx, id);
  await pool.query(
    `UPDATE public.assignments SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $${values.length + 1}`,
    [...values, id] as never[]
  );
  return getAssignmentView(ctx, id);
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

const SELECT_SUBMISSION = `
  SELECT s.*, p.full_name AS student_name, a.title AS assignment_title
    FROM public.assignment_submissions s
    JOIN public.profiles p ON p.id = s.student_id
    JOIN public.assignments a ON a.id = s.assignment_id
`;

export type CreateSubmissionInput = {
  contentText: string;
  contentNote?: string;
  submit?: boolean;
};

/**
 * Student creates own attempt (history-preserving). Faculty may not submit.
 */
export async function createSubmission(
  ctx: AuthContext,
  assignmentId: string,
  input: CreateSubmissionInput
): Promise<SubmissionView> {
  if (ctx.roleName !== ROLES.student) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only students may submit assignment work"
    );
  }
  const assignment = await assertCanAccessAssignment(ctx, assignmentId);
  if (assignment.status === "draft" || assignment.status === "archived") {
    throw new AssessmentValidationError(
      "Assignment is not open for submission"
    );
  }

  const content = (input.contentText || "").trim();
  if (content.length < 1 || content.length > 20000) {
    throw new AssessmentValidationError(
      "contentText must be 1–20000 characters"
    );
  }

  const existing = await pool.query<{
    attempt_number: number;
    status: string;
    reviewed_at: Date | null;
  }>(
    `SELECT attempt_number, status, reviewed_at
       FROM public.assignment_submissions
      WHERE assignment_id = $1 AND student_id = $2
      ORDER BY attempt_number DESC
      LIMIT 1`,
    [assignmentId, ctx.userId]
  );
  const last = existing.rows[0];

  if (last) {
    if (last.reviewed_at && !assignment.allow_resubmit) {
      throw new AssessmentValidationError(
        "Submission already reviewed; resubmission not allowed"
      );
    }
    if (last.status === "submitted" && last.reviewed_at === null) {
      throw new AssessmentValidationError(
        "A submission is already awaiting review"
      );
    }
    if (last.status === "graded" && !assignment.allow_resubmit) {
      throw new AssessmentValidationError(
        "Graded submission cannot be replaced"
      );
    }
    if (last.status === "returned" || last.status === "draft") {
      if (last.status === "draft") {
        // update draft rather than new attempt
        const shouldSubmit = input.submit !== false;
        const updated = await pool.query<SubmissionRow>(
          `UPDATE public.assignment_submissions
              SET content_text = $2,
                  content_note = $3,
                  status = $4,
                  submitted_at = CASE WHEN $4 = 'submitted' THEN now() ELSE submitted_at END
            WHERE id = (
              SELECT id FROM public.assignment_submissions
               WHERE assignment_id = $1 AND student_id = $5 AND attempt_number = $6
            )
            RETURNING *`,
          [
            assignmentId,
            content,
            (input.contentNote || "").trim().slice(0, 2000),
            shouldSubmit ? "submitted" : "draft",
            ctx.userId,
            last.attempt_number,
          ]
        );
        return hydrateSubmission(updated.rows[0]);
      }
      // returned → submit as new attempt preserving history
      const attempt = last.attempt_number + 1;
      const inserted = await pool.query<SubmissionRow>(
        `INSERT INTO public.assignment_submissions (
            assignment_id, institution_id, section_id, subject_id, student_id,
            attempt_number, status, content_text, content_note, submitted_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          assignmentId,
          assignment.institution_id,
          assignment.section_id,
          assignment.subject_id,
          ctx.userId,
          attempt,
          input.submit === false ? "draft" : "submitted",
          content,
          (input.contentNote || "").trim().slice(0, 2000),
          input.submit === false ? null : new Date(),
        ]
      );
      return hydrateSubmission(inserted.rows[0]);
    }
  }

  const attempt = (last?.attempt_number ?? 0) + 1;
  const shouldSubmit = input.submit !== false;
  try {
    const inserted = await pool.query<SubmissionRow>(
      `INSERT INTO public.assignment_submissions (
          assignment_id, institution_id, section_id, subject_id, student_id,
          attempt_number, status, content_text, content_note, submitted_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        assignmentId,
        assignment.institution_id,
        assignment.section_id,
        assignment.subject_id,
        ctx.userId,
        attempt,
        shouldSubmit ? "submitted" : "draft",
        content,
        (input.contentNote || "").trim().slice(0, 2000),
        shouldSubmit ? new Date() : null,
      ]
    );
    return hydrateSubmission(inserted.rows[0]);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      throw new AssessmentValidationError(
        "Submission conflict — refresh and retry"
      );
    }
    throw error;
  }
}

async function hydrateSubmission(row: SubmissionRow): Promise<SubmissionView> {
  const view = await pool.query<SubmissionView>(
    `${SELECT_SUBMISSION} WHERE s.id = $1`,
    [row.id]
  );
  const out = view.rows[0];
  if (!out) throw new AuthzError("FORBIDDEN", "Submission not found");
  return out;
}

export async function assertCanAccessSubmission(
  ctx: AuthContext,
  submissionId: string
): Promise<SubmissionRow> {
  const r = await pool.query<SubmissionRow>(
    `SELECT * FROM public.assignment_submissions WHERE id = $1`,
    [submissionId]
  );
  const row = r.rows[0];
  if (!row) throw new AuthzError("FORBIDDEN", "Submission not found");

  if (ctx.roleName === ROLES.systemAdmin) return row;
  if (ctx.roleName === ROLES.admin) {
    assertInstitution(ctx, row.institution_id);
    return row;
  }

  // Student: ONLY own submission (never peers)
  if (ctx.roleName === ROLES.student) {
    if (row.student_id !== ctx.userId) {
      throw new AuthzError(
        "FORBIDDEN",
        "Students may only access their own submission"
      );
    }
    return row;
  }

  const assignment = await assertCanAccessAssignment(ctx, row.assignment_id);
  if (ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    const heads = scope.headships.some(
      (h) =>
        h.status === "ACTIVE" &&
        h.valid_to === null &&
        h.department_id === assignment.department_id
    );
    if (heads) return row;
  }

  // Faculty review: must own assignment or cover section+subject
  if (assignment.owner_id === ctx.userId || assignment.created_by === ctx.userId) {
    return row;
  }
  if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    const covers = scope.facultyAssignments.some(
      (a) =>
        a.status === "active" &&
        a.section_id === assignment.section_id &&
        a.subject_id === assignment.subject_id
    );
    if (covers) return row;
  }

  throw new AuthzError(
    "FORBIDDEN",
    "Not authorized to view this submission"
  );
}

export async function getSubmissionView(
  ctx: AuthContext,
  submissionId: string
): Promise<SubmissionView> {
  await assertCanAccessSubmission(ctx, submissionId);
  return hydrateSubmission(
    (
      await pool.query<SubmissionRow>(
        `SELECT * FROM public.assignment_submissions WHERE id = $1`,
        [submissionId]
      )
    ).rows[0]!
  );
}

/**
 * List submissions for an assignment.
 * Student → own rows only. Faculty/HOD/admin → all (in assignment scope).
 */
export async function listSubmissionsForAssignment(
  ctx: AuthContext,
  assignmentId: string,
  opts: { studentId?: string; status?: string } = {}
): Promise<SubmissionView[]> {
  await assertCanAccessAssignment(ctx, assignmentId);

  const params: unknown[] = [assignmentId];
  let where = `s.assignment_id = $1`;

  if (ctx.roleName === ROLES.student) {
    params.push(ctx.userId);
    where += ` AND s.student_id = $${params.length}`;
  } else if (opts.studentId) {
    if (ctx.roleName === ROLES.student && opts.studentId !== ctx.userId) {
      throw new AuthzError(
        "FORBIDDEN",
        "Students may only list own submissions"
      );
    }
    params.push(opts.studentId);
    where += ` AND s.student_id = $${params.length}`;
  }

  if (opts.status && isSubmissionStatus(opts.status)) {
    params.push(opts.status);
    where += ` AND s.status = $${params.length}`;
  }

  const result = await pool.query<SubmissionView>(
    `${SELECT_SUBMISSION}
      WHERE ${where}
      ORDER BY s.attempt_number DESC, s.updated_at DESC`,
    params
  );
  return result.rows.map((row) => ({
    ...row,
    is_student: row.student_id === ctx.userId,
  }));
}

export type ReviewSubmissionInput = {
  action?: "grade" | "return" | "submitted";
  score?: number | null;
  feedback?: string;
};

/**
 * Faculty/HOD/admin review: grade (score+feedback) or return for revision.
 * Preserves prior attempts; updates current row status + review fields.
 */
export async function reviewSubmission(
  ctx: AuthContext,
  submissionId: string,
  input: ReviewSubmissionInput
): Promise<SubmissionView> {
  const row = await assertCanAccessSubmission(ctx, submissionId);
  if (ctx.roleName === ROLES.student) {
    throw new AuthzError("FORBIDDEN", "Students may not review submissions");
  }

  const assignment = await pool.query<{
    max_points: number | null;
    status: string;
  }>(
    `SELECT max_points, status FROM public.assignments WHERE id = $1`,
    [row.assignment_id]
  );
  const meta = assignment.rows[0];

  const action = input.action ?? "grade";
  if (action === "grade") {
    if (row.status !== "submitted" && row.status !== "graded") {
      throw new AssessmentValidationError(
        "Only submitted/graded work can be graded"
      );
    }
    if (input.score === null || input.score === undefined) {
      throw new AssessmentValidationError("score is required to grade");
    }
    const score = Number(input.score);
    if (!Number.isInteger(score) || score < 0) {
      throw new AssessmentValidationError("score must be integer ≥ 0");
    }
    const max = meta?.max_points;
    if (max !== null && max !== undefined && score > max) {
      throw new AssessmentValidationError(`score cannot exceed ${max}`);
    }
    const updated = await pool.query<SubmissionRow>(
      `UPDATE public.assignment_submissions
          SET status = 'graded',
              score = $2,
              max_points_snapshot = $3,
              feedback = $4,
              reviewed_by = $5,
              reviewed_at = now()
        WHERE id = $1
        RETURNING *`,
      [
        submissionId,
        score,
        max ?? null,
        (input.feedback || "").trim().slice(0, 4000),
        ctx.userId,
      ]
    );
    return hydrateSubmission(updated.rows[0]);
  }

  if (action === "return") {
    if (row.status !== "submitted" && row.status !== "graded") {
      throw new AssessmentValidationError(
        "Only submitted/graded work can be returned"
      );
    }
    const updated = await pool.query<SubmissionRow>(
      `UPDATE public.assignment_submissions
          SET status = 'returned',
              returned_at = now(),
              feedback = $2,
              reviewed_by = $3,
              reviewed_at = now(),
              score = NULL
        WHERE id = $1
        RETURNING *`,
      [
        submissionId,
        (input.feedback || "").trim().slice(0, 4000),
        ctx.userId,
      ]
    );
    return hydrateSubmission(updated.rows[0]);
  }

  throw new AssessmentValidationError(`Invalid review action: ${action}`);
}
