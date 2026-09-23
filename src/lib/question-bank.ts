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
  canTransitionPaper,
  canTransitionQuestionBank,
  isPaperKind,
  isPaperStatus,
  isQuestionBankStatus,
  isQuestionType,
  type PaperStatus,
  type QuestionBankStatus,
} from "@/lib/assessment-types";

/**
 * Question bank + question papers (Milestone 6).
 * Review/approval foundation: bank draft→approved→retired;
 * papers draft→in_review→approved→published→archived.
 * No AI generation.
 */

// ---------------------------------------------------------------------------
// Question bank
// ---------------------------------------------------------------------------

export type QuestionBankRow = {
  id: string;
  institution_id: string;
  department_id: string;
  program_id: string;
  academic_year_id: string | null;
  subject_id: string;
  owner_id: string;
  created_by: string;
  question_type: string;
  question_text: string;
  options: unknown;
  answer_key: string;
  explanation: string;
  marks: number;
  difficulty: string;
  unit_ref: string | null;
  status: QuestionBankStatus;
  approved_by: string | null;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type QuestionBankView = QuestionBankRow & {
  subject_name: string;
  subject_code: string;
  owner_name: string;
  is_owner: boolean;
};

const SELECT_BANK = `
  SELECT q.*,
         sub.name AS subject_name,
         sub.subject_code,
         o.full_name AS owner_name
    FROM public.question_bank_items q
    JOIN public.subjects sub ON sub.id = q.subject_id
    JOIN public.profiles o ON o.id = q.owner_id
`;

async function buildBankFilter(
  ctx: AuthContext,
  query: { status?: string; subjectId?: string }
): Promise<{ where: string; params: unknown[] }> {
  const params: unknown[] = [];
  const parts: string[] = [];
  const push = (sql: string, ...values: unknown[]) => {
    const start = params.length + 1;
    params.push(...values);
    let i = start;
    parts.push(sql.replace(/\?/g, () => `$${i++}`));
  };

  if (query.status && isQuestionBankStatus(query.status)) {
    push(`q.status = ?`, query.status);
  }
  if (query.subjectId) {
    push(`q.subject_id = ?::uuid`, query.subjectId);
  }

  if (ctx.roleName === ROLES.systemAdmin) {
    // any
  } else if (ctx.roleName === ROLES.admin) {
    push(`q.institution_id = ?::uuid`, ctx.institutionId);
  } else if (ctx.roleName === ROLES.student) {
    // Students do not browse the bank (answer keys). Only via published papers.
    push(`FALSE`);
  } else if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    push(`q.institution_id = ?::uuid`, ctx.institutionId);
    const ors: string[] = [];
    const start = params.length + 1;
    let i = start;
    ors.push(`q.owner_id = $${i++}`);
    params.push(ctx.userId);
    for (const a of scope.facultyAssignments) {
      if (a.status !== "active") continue;
      ors.push(`q.subject_id = $${i++}`);
      params.push(a.subject_id);
    }
    if (ctx.roleName === ROLES.hod) {
      for (const h of scope.headships) {
        if (h.status !== "ACTIVE" || h.valid_to !== null) continue;
        ors.push(`q.department_id = $${i++}`);
        params.push(h.department_id);
      }
    }
    parts.push(`(${ors.join(" OR ")})`);
  } else {
    push(`FALSE`);
  }

  return {
    where: parts.length ? `WHERE ${parts.join(" AND ")}` : "",
    params,
  };
}

export async function listQuestionBank(
  ctx: AuthContext,
  query: { status?: string; subjectId?: string; limit?: number } = {}
): Promise<QuestionBankView[]> {
  const filter = await buildBankFilter(ctx, query);
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const result = await pool.query<QuestionBankView>(
    `${SELECT_BANK} ${filter.where}
     ORDER BY q.updated_at DESC LIMIT ${limit}`,
    filter.params as never[]
  );
  return result.rows.map((row) => ({
    ...row,
    is_owner: row.owner_id === ctx.userId || row.created_by === ctx.userId,
  }));
}

async function loadBankRow(id: string): Promise<QuestionBankRow | null> {
  const r = await pool.query<QuestionBankRow>(
    `SELECT * FROM public.question_bank_items WHERE id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function assertCanAccessQuestion(
  ctx: AuthContext,
  id: string
): Promise<QuestionBankRow> {
  const row = await loadBankRow(id);
  if (!row) throw new AuthzError("FORBIDDEN", "Question not found");
  if (ctx.roleName === ROLES.student) {
    throw new AuthzError(
      "FORBIDDEN",
      "Question bank is not accessible to students"
    );
  }
  if (ctx.roleName === ROLES.systemAdmin) return row;
  if (ctx.roleName === ROLES.admin) {
    assertInstitution(ctx, row.institution_id);
    return row;
  }
  assertInstitution(ctx, row.institution_id);
  if (row.owner_id === ctx.userId || row.created_by === ctx.userId) return row;

  const scope = await getAcademicScope(ctx);
  const coversSubject = scope.facultyAssignments.some(
    (a) => a.status === "active" && a.subject_id === row.subject_id
  );
  if (coversSubject) return row;
  if (ctx.roleName === ROLES.hod) {
    const heads = scope.headships.some(
      (h) =>
        h.status === "ACTIVE" &&
        h.valid_to === null &&
        h.department_id === row.department_id
    );
    if (heads) return row;
  }
  if (row.status === "approved") return row;
  throw new AuthzError(
    "FORBIDDEN",
    "No subject assignment covers this question"
  );
}

async function resolveSubjectMeta(subjectId: string) {
  const r = await pool.query<{
    institution_id: string;
    department_id: string;
    program_id: string;
  }>(
    `SELECT s.institution_id, p.department_id, s.program_id
       FROM public.subjects s
       JOIN public.programs p ON p.id = s.program_id
      WHERE s.id = $1`,
    [subjectId]
  );
  const row = r.rows[0];
  if (!row) throw new AuthzError("FORBIDDEN", "Subject not found");
  return row;
}

export async function assertCanCreateQuestion(
  ctx: AuthContext,
  subjectId: string
): Promise<void> {
  const meta = await resolveSubjectMeta(subjectId);
  assertInstitution(ctx, meta.institution_id);
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
          h.department_id === meta.department_id
      );
      if (heads) return;
    }
    const teaches = scope.facultyAssignments.some(
      (a) => a.status === "active" && a.subject_id === subjectId
    );
    if (teaches) return;
    throw new AuthzError(
      "FORBIDDEN",
      "No active assignment covers this subject"
    );
  }
  throw new AuthzError(
    "FORBIDDEN",
    "Only faculty, HOD, or admin may add questions"
  );
}

export type CreateQuestionInput = {
  subjectId: string;
  academicYearId?: string | null;
  questionType?: string;
  questionText: string;
  options?: unknown;
  answerKey?: string;
  explanation?: string;
  marks?: number;
  difficulty?: string;
  unitRef?: string | null;
  status?: string;
};

export async function createQuestion(
  ctx: AuthContext,
  input: CreateQuestionInput
): Promise<QuestionBankView> {
  const text = (input.questionText || "").trim();
  if (text.length < 2 || text.length > 5000) {
    throw new AssessmentValidationError(
      "questionText must be 2–5000 characters"
    );
  }
  await assertCanCreateQuestion(ctx, input.subjectId);
  const meta = await resolveSubjectMeta(input.subjectId);

  const questionType = isQuestionType(input.questionType)
    ? input.questionType
    : "short";
  const marks = Number(input.marks ?? 1);
  if (!Number.isInteger(marks) || marks < 1) {
    throw new AssessmentValidationError("marks must be integer ≥ 1");
  }
  const difficulty = ["easy", "medium", "hard"].includes(
    String(input.difficulty || "")
  )
    ? String(input.difficulty)
    : "medium";

  let status: QuestionBankStatus = "draft";
  if (input.status !== undefined) {
    if (!isQuestionBankStatus(input.status)) {
      throw new AssessmentValidationError("Invalid status");
    }
    status = input.status;
  }

  let options: unknown = [];
  if (input.options !== undefined && input.options !== null) {
    if (typeof input.options === "string") {
      try {
        options = JSON.parse(input.options);
      } catch {
        throw new AssessmentValidationError("options must be JSON array");
      }
    } else {
      options = input.options;
    }
    if (!Array.isArray(options)) {
      throw new AssessmentValidationError("options must be an array");
    }
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO public.question_bank_items (
        institution_id, department_id, program_id, academic_year_id,
        subject_id, owner_id, created_by, question_type, question_text,
        options, answer_key, explanation, marks, difficulty, unit_ref, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [
      meta.institution_id,
      meta.department_id,
      meta.program_id,
      input.academicYearId || null,
      input.subjectId,
      ctx.userId,
      ctx.userId,
      questionType,
      text,
      JSON.stringify(options),
      (input.answerKey || "").trim().slice(0, 2000),
      (input.explanation || "").trim().slice(0, 4000),
      marks,
      difficulty,
      input.unitRef?.trim() || null,
      status,
    ]
  );
  return getQuestionView(ctx, inserted.rows[0].id);
}

export async function getQuestionView(
  ctx: AuthContext,
  id: string
): Promise<QuestionBankView> {
  await assertCanAccessQuestion(ctx, id);
  const view = await pool.query<QuestionBankView>(
    `${SELECT_BANK} WHERE q.id = $1`,
    [id]
  );
  const out = view.rows[0];
  if (!out) throw new AuthzError("FORBIDDEN", "Question not found");
  return {
    ...out,
    is_owner: out.owner_id === ctx.userId || out.created_by === ctx.userId,
  };
}

export async function updateQuestion(
  ctx: AuthContext,
  id: string,
  input: {
    questionText?: string;
    answerKey?: string;
    explanation?: string;
    marks?: number;
    difficulty?: string;
    unitRef?: string | null;
    status?: string;
    options?: unknown;
  }
): Promise<QuestionBankView> {
  const row = await assertCanAccessQuestion(ctx, id);
  const isOwner = row.owner_id === ctx.userId || row.created_by === ctx.userId;
  const isAdmin =
    ctx.roleName === ROLES.admin || ctx.roleName === ROLES.systemAdmin;
  const isHod = await (async () => {
    if (ctx.roleName !== ROLES.hod) return false;
    const scope = await getAcademicScope(ctx);
    return scope.headships.some(
      (h) =>
        h.status === "ACTIVE" &&
        h.valid_to === null &&
        h.department_id === row.department_id
    );
  })();

  if (!isOwner && !isAdmin && !isHod) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only owner, HOD, or admin may modify this question"
    );
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (col: string, val: unknown) => {
    values.push(val);
    fields.push(`${col} = $${values.length}`);
  };

  if (input.questionText !== undefined) {
    if (!isOwner && !isAdmin) {
      throw new AuthzError("FORBIDDEN", "Only owner may edit content");
    }
    const t = input.questionText.trim();
    if (t.length < 2 || t.length > 5000) {
      throw new AssessmentValidationError("questionText invalid length");
    }
    set("question_text", t);
  }
  if (input.answerKey !== undefined && (isOwner || isAdmin)) {
    set("answer_key", input.answerKey.trim().slice(0, 2000));
  }
  if (input.explanation !== undefined && (isOwner || isAdmin)) {
    set("explanation", input.explanation.trim().slice(0, 4000));
  }
  if (input.marks !== undefined && (isOwner || isAdmin)) {
    const n = Number(input.marks);
    if (!Number.isInteger(n) || n < 1) {
      throw new AssessmentValidationError("marks must be ≥ 1");
    }
    set("marks", n);
  }
  if (input.difficulty !== undefined && (isOwner || isAdmin)) {
    if (!["easy", "medium", "hard"].includes(input.difficulty)) {
      throw new AssessmentValidationError("Invalid difficulty");
    }
    set("difficulty", input.difficulty);
  }
  if (input.unitRef !== undefined && (isOwner || isAdmin)) {
    set("unit_ref", input.unitRef?.trim() || null);
  }
  if (input.options !== undefined && (isOwner || isAdmin)) {
    const opts =
      typeof input.options === "string"
        ? JSON.parse(input.options)
        : input.options;
    if (!Array.isArray(opts)) {
      throw new AssessmentValidationError("options must be array");
    }
    set("options", JSON.stringify(opts));
  }

  if (input.status !== undefined) {
    if (!isQuestionBankStatus(input.status)) {
      throw new AssessmentValidationError("Invalid status");
    }
    const to = input.status;
    if (to !== row.status) {
      if (!canTransitionQuestionBank(row.status, to)) {
        throw new AssessmentValidationError(
          `Invalid question transition ${row.status} → ${to}`
        );
      }
      // Approval foundation: HOD/admin or (owner may self-draft; approve needs HOD/admin unless owner is faculty lead)
      if (to === "approved") {
        const mayApprove =
          isAdmin ||
          isHod ||
          ctx.roleName === ROLES.directorDean ||
          isOwner; // faculty may approve own bank items in foundation (documented)
        if (!mayApprove) {
          throw new AuthzError(
            "FORBIDDEN",
            "Only owner, HOD, or admin may approve questions"
          );
        }
        set("status", to);
        set("approved_by", ctx.userId);
        set("approved_at", new Date());
      } else if (to === "draft") {
        set("status", to);
        set("approved_by", null);
        set("approved_at", null);
      } else {
        set("status", to);
      }
    }
  }

  if (fields.length === 0) return getQuestionView(ctx, id);
  await pool.query(
    `UPDATE public.question_bank_items SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $${values.length + 1}`,
    [...values, id] as never[]
  );
  return getQuestionView(ctx, id);
}

// ---------------------------------------------------------------------------
// Question papers
// ---------------------------------------------------------------------------

export type QuestionPaperRow = {
  id: string;
  institution_id: string;
  university_id: string;
  department_id: string;
  program_id: string;
  academic_year_id: string;
  semester_id: string;
  section_id: string | null;
  subject_id: string;
  owner_id: string;
  created_by: string;
  title: string;
  description: string;
  paper_kind: string;
  total_marks: number;
  duration_minutes: number | null;
  status: PaperStatus;
  submitted_by: string | null;
  submitted_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  approval_note: string | null;
  published_by: string | null;
  published_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

export type QuestionPaperView = QuestionPaperRow & {
  subject_name: string;
  subject_code: string;
  section_name: string | null;
  owner_name: string;
  is_owner: boolean;
  item_count: number;
};

const SELECT_PAPER = `
  SELECT p.*,
         sub.name AS subject_name,
         sub.subject_code,
         sec.name AS section_name,
         o.full_name AS owner_name,
         (
           SELECT count(*)::int
             FROM public.question_paper_items i
            WHERE i.paper_id = p.id
         ) AS item_count
    FROM public.question_papers p
    JOIN public.subjects sub ON sub.id = p.subject_id
    LEFT JOIN public.sections sec ON sec.id = p.section_id
    JOIN public.profiles o ON o.id = p.owner_id
`;

async function buildPaperFilter(
  ctx: AuthContext,
  query: { status?: string; subjectId?: string; paperKind?: string }
): Promise<{ where: string; params: unknown[] }> {
  const params: unknown[] = [];
  const parts: string[] = [];
  const push = (sql: string, ...values: unknown[]) => {
    const start = params.length + 1;
    params.push(...values);
    let i = start;
    parts.push(sql.replace(/\?/g, () => `$${i++}`));
  };

  if (query.status && isPaperStatus(query.status)) {
    push(`p.status = ?`, query.status);
  }
  if (query.subjectId) {
    push(`p.subject_id = ?::uuid`, query.subjectId);
  }
  if (query.paperKind) {
    push(`p.paper_kind = ?`, query.paperKind);
  }

  if (ctx.roleName === ROLES.systemAdmin) {
    // any
  } else if (ctx.roleName === ROLES.admin) {
    push(`p.institution_id = ?::uuid`, ctx.institutionId);
  } else if (ctx.roleName === ROLES.student) {
    const scope = await getAcademicScope(ctx);
    const enr = scope.enrollment;
    if (!enr || enr.status !== "active") {
      push(`FALSE`);
    } else {
      push(`p.institution_id = ?::uuid`, enr.institution_id);
      push(`(p.section_id IS NULL OR p.section_id = ?::uuid)`, enr.section_id);
      push(`p.subject_id IN (
        SELECT ss.subject_id FROM public.section_subjects ss
         WHERE ss.section_id = ?::uuid
      )`, enr.section_id);
      push(`(p.status = 'published' OR p.owner_id = ?::uuid)`, ctx.userId);
    }
  } else if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    push(`p.institution_id = ?::uuid`, ctx.institutionId);
    const ors: string[] = [];
    const start = params.length + 1;
    let i = start;
    ors.push(`p.owner_id = $${i++}`);
    params.push(ctx.userId);
    for (const a of scope.facultyAssignments) {
      if (a.status !== "active") continue;
      ors.push(
        `(p.subject_id = $${i++} AND (p.section_id IS NULL OR p.section_id = $${i++}))`
      );
      params.push(a.subject_id, a.section_id);
    }
    if (ctx.roleName === ROLES.hod) {
      for (const h of scope.headships) {
        if (h.status !== "ACTIVE" || h.valid_to !== null) continue;
        ors.push(`p.department_id = $${i++}`);
        params.push(h.department_id);
      }
    }
    parts.push(`(${ors.join(" OR ")})`);
  } else {
    push(`p.institution_id = ?::uuid`, ctx.institutionId);
    push(`p.status = 'published'`);
  }

  return {
    where: parts.length ? `WHERE ${parts.join(" AND ")}` : "",
    params,
  };
}

export async function listQuestionPapers(
  ctx: AuthContext,
  query: {
    status?: string;
    subjectId?: string;
    paperKind?: string;
    limit?: number;
  } = {}
): Promise<QuestionPaperView[]> {
  const filter = await buildPaperFilter(ctx, query);
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const result = await pool.query<QuestionPaperView>(
    `${SELECT_PAPER} ${filter.where}
     ORDER BY p.updated_at DESC LIMIT ${limit}`,
    filter.params as never[]
  );
  return result.rows.map((row) => ({
    ...row,
    is_owner: row.owner_id === ctx.userId || row.created_by === ctx.userId,
  }));
}

async function loadPaperRow(id: string): Promise<QuestionPaperRow | null> {
  const r = await pool.query<QuestionPaperRow>(
    `SELECT * FROM public.question_papers WHERE id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function assertCanAccessPaper(
  ctx: AuthContext,
  id: string
): Promise<QuestionPaperRow> {
  const row = await loadPaperRow(id);
  if (!row) throw new AuthzError("FORBIDDEN", "Paper not found");

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
    if (row.section_id !== null && row.section_id !== enr.section_id) {
      throw new AuthzError("FORBIDDEN", "Paper outside enrolled section");
    }
    const linked = await pool.query(
      `SELECT 1 FROM public.section_subjects
        WHERE section_id = $1 AND subject_id = $2`,
      [enr.section_id, row.subject_id]
    );
    if (linked.rows.length === 0) {
      throw new AuthzError("FORBIDDEN", "Subject not in enrolled section");
    }
    if (row.status !== "published" && row.owner_id !== ctx.userId) {
      throw new AuthzError("FORBIDDEN", "Paper not published");
    }
    return row;
  }

  assertInstitution(ctx, row.institution_id);
  if (row.owner_id === ctx.userId || row.created_by === ctx.userId) return row;
  const scope = await getAcademicScope(ctx);
  const covers = scope.facultyAssignments.some(
    (a) =>
      a.status === "active" &&
      a.subject_id === row.subject_id &&
      (row.section_id === null || a.section_id === row.section_id)
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
  if (row.status === "published") return row;
  throw new AuthzError(
    "FORBIDDEN",
    "No teaching assignment covers this paper"
  );
}

async function resolvePaperScope(sectionId: string | null, subjectId: string) {
  const sub = await pool.query<{
    institution_id: string;
    department_id: string;
    program_id: string;
  }>(
    `SELECT s.institution_id, p.department_id, s.program_id
       FROM public.subjects s
       JOIN public.programs p ON p.id = s.program_id
      WHERE s.id = $1`,
    [subjectId]
  );
  const subjectMeta = sub.rows[0];
  if (!subjectMeta) throw new AuthzError("FORBIDDEN", "Subject not found");

  if (!sectionId) {
    // subject-level paper — need program's latest active year/semester optional: use program only + require academicYear/semester from input optional
    return {
      institution_id: subjectMeta.institution_id,
      university_id: (
        await pool.query<{ university_id: string }>(
          `SELECT d.university_id FROM public.departments d WHERE d.id = $1`,
          [subjectMeta.department_id]
        )
      ).rows[0]!.university_id,
      department_id: subjectMeta.department_id,
      program_id: subjectMeta.program_id,
      academic_year_id: null as string | null,
      semester_id: null as string | null,
      section_id: null as string | null,
      subject_id: subjectId,
    };
  }

  const sec = await pool.query<{
    institution_id: string;
    university_id: string;
    department_id: string;
    program_id: string;
    academic_year_id: string;
    semester_id: string;
    subject_program_id: string;
  }>(
    `SELECT s.institution_id, s.semester_id, ay.program_id, ay.id AS academic_year_id,
            p.department_id, d.university_id, sub.program_id AS subject_program_id
       FROM public.sections s
       JOIN public.semesters sm ON sm.id = s.semester_id
       JOIN public.academic_years ay ON ay.id = sm.academic_year_id
       JOIN public.programs p ON p.id = ay.program_id
       JOIN public.departments d ON d.id = p.department_id
       JOIN public.subjects sub ON sub.id = $2
      WHERE s.id = $1`,
    [sectionId, subjectId]
  );
  const row = sec.rows[0];
  if (!row) throw new AuthzError("FORBIDDEN", "Section/subject not found");
  if (row.subject_program_id !== row.program_id) {
    throw new AuthzError("FORBIDDEN", "Subject/section program mismatch");
  }
  return {
    institution_id: row.institution_id,
    university_id: row.university_id,
    department_id: row.department_id,
    program_id: row.program_id,
    academic_year_id: row.academic_year_id as string | null,
    semester_id: row.semester_id as string | null,
    section_id: sectionId as string | null,
    subject_id: subjectId,
  };
}

export async function assertCanCreatePaper(
  ctx: AuthContext,
  target: { sectionId?: string | null; subjectId: string }
): Promise<void> {
  const scopeRow = await resolvePaperScope(
    target.sectionId ?? null,
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
        a.subject_id === target.subjectId &&
        (!target.sectionId || a.section_id === target.sectionId)
    );
    if (teaches) return;
    throw new AuthzError(
      "FORBIDDEN",
      "No active teaching assignment covers this subject"
    );
  }
  throw new AuthzError(
    "FORBIDDEN",
    "Only faculty, HOD, or admin may create question papers"
  );
}

export type CreatePaperInput = {
  sectionId?: string | null;
  subjectId: string;
  academicYearId?: string | null;
  semesterId?: string | null;
  title: string;
  description?: string;
  paperKind?: string;
  totalMarks?: number;
  durationMinutes?: number | null;
  status?: string;
};

export async function createQuestionPaper(
  ctx: AuthContext,
  input: CreatePaperInput
): Promise<QuestionPaperView> {
  const title = (input.title || "").trim();
  if (title.length < 2 || title.length > 200) {
    throw new AssessmentValidationError("Title must be 2–200 characters");
  }
  await assertCanCreatePaper(ctx, {
    sectionId: input.sectionId ?? null,
    subjectId: input.subjectId,
  });
  const scopeRow = await resolvePaperScope(
    input.sectionId ?? null,
    input.subjectId
  );

  // If subject-level (no section), academicYear + semester required for FKs
  if (!scopeRow.academic_year_id) {
    if (!input.academicYearId || !input.semesterId) {
      throw new AssessmentValidationError(
        "academicYearId and semesterId required without sectionId"
      );
    }
    scopeRow.academic_year_id = input.academicYearId;
    scopeRow.semester_id = input.semesterId;
  }

  const paperKind = isPaperKind(input.paperKind) ? input.paperKind : "assignment";
  let status: PaperStatus = "draft";
  if (input.status !== undefined) {
    if (!isPaperStatus(input.status)) {
      throw new AssessmentValidationError("Invalid status");
    }
    if (!["draft", "in_review"].includes(input.status)) {
      throw new AssessmentValidationError(
        "New papers may only start as draft or in_review"
      );
    }
    status = input.status;
  }

  const totalMarks = Number(input.totalMarks ?? 0);
  if (!Number.isInteger(totalMarks) || totalMarks < 0) {
    throw new AssessmentValidationError("totalMarks must be ≥ 0");
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO public.question_papers (
        institution_id, university_id, department_id, program_id,
        academic_year_id, semester_id, section_id, subject_id,
        owner_id, created_by, title, description, paper_kind,
        total_marks, duration_minutes, status,
        submitted_by, submitted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING id`,
    [
      scopeRow.institution_id,
      scopeRow.university_id,
      scopeRow.department_id,
      scopeRow.program_id,
      scopeRow.academic_year_id,
      scopeRow.semester_id,
      scopeRow.section_id,
      input.subjectId,
      ctx.userId,
      ctx.userId,
      title,
      (input.description || "").trim().slice(0, 4000),
      paperKind,
      totalMarks,
      input.durationMinutes ?? null,
      status,
      status === "in_review" ? ctx.userId : null,
      status === "in_review" ? new Date() : null,
    ]
  );
  return getQuestionPaperView(ctx, inserted.rows[0].id);
}

export async function getQuestionPaperView(
  ctx: AuthContext,
  id: string
): Promise<QuestionPaperView> {
  await assertCanAccessPaper(ctx, id);
  const view = await pool.query<QuestionPaperView>(
    `${SELECT_PAPER} WHERE p.id = $1`,
    [id]
  );
  const out = view.rows[0];
  if (!out) throw new AuthzError("FORBIDDEN", "Paper not found");
  return {
    ...out,
    is_owner: out.owner_id === ctx.userId || out.created_by === ctx.userId,
  };
}

export async function updateQuestionPaper(
  ctx: AuthContext,
  id: string,
  input: {
    title?: string;
    description?: string;
    status?: string;
    approvalNote?: string;
    totalMarks?: number;
    durationMinutes?: number | null;
  }
): Promise<QuestionPaperView> {
  const row = await assertCanAccessPaper(ctx, id);
  const isOwner = row.owner_id === ctx.userId || row.created_by === ctx.userId;
  const isAdmin =
    ctx.roleName === ROLES.admin ||
    ctx.roleName === ROLES.systemAdmin ||
    ctx.roleName === ROLES.directorDean;
  const isHod = await (async () => {
    if (ctx.roleName !== ROLES.hod) return false;
    const scope = await getAcademicScope(ctx);
    return scope.headships.some(
      (h) =>
        h.status === "ACTIVE" &&
        h.valid_to === null &&
        h.department_id === row.department_id
    );
  })();

  if (!isOwner && !isAdmin && !isHod) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only owner, HOD, or admin may modify this paper"
    );
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (col: string, val: unknown) => {
    values.push(val);
    fields.push(`${col} = $${values.length}`);
  };

  if (input.title !== undefined) {
    if (row.status === "published" || row.status === "archived") {
      throw new AssessmentValidationError(
        "Cannot edit title while published/archived"
      );
    }
    const t = input.title.trim();
    if (t.length < 2 || t.length > 200) {
      throw new AssessmentValidationError("Title must be 2–200 characters");
    }
    set("title", t);
    fields.push(`version = version + 1`);
  }
  if (input.description !== undefined && row.status !== "published") {
    set("description", input.description.trim().slice(0, 4000));
    fields.push(`version = version + 1`);
  }
  if (input.totalMarks !== undefined) {
    const n = Number(input.totalMarks);
    if (!Number.isInteger(n) || n < 0) {
      throw new AssessmentValidationError("totalMarks must be ≥ 0");
    }
    set("total_marks", n);
  }
  if (input.durationMinutes !== undefined) {
    set("duration_minutes", input.durationMinutes ?? null);
  }

  if (input.status !== undefined) {
    if (!isPaperStatus(input.status)) {
      throw new AssessmentValidationError("Invalid status");
    }
    const to = input.status;
    if (to !== row.status) {
      if (!canTransitionPaper(row.status, to)) {
        throw new AssessmentValidationError(
          `Invalid paper transition ${row.status} → ${to}`
        );
      }
      if (to === "in_review" || to === "approved" || to === "archived") {
        if (to === "approved" && !isAdmin && !isHod) {
          if (isOwner && ctx.roleName === ROLES.faculty) {
            // allow foundation self-approve by owner faculty? require HOD/admin for paper approval
            throw new AuthzError(
              "FORBIDDEN",
              "Paper approval requires HOD or admin"
            );
          }
          throw new AuthzError(
            "FORBIDDEN",
            "Paper approval requires HOD or admin"
          );
        }
      }
      if (to === "in_review") {
        set("submitted_by", ctx.userId);
        set("submitted_at", new Date());
      } else if (to === "approved") {
        set("approved_by", ctx.userId);
        set("approved_at", new Date());
        set("approval_note", input.approvalNote?.trim().slice(0, 1000) || null);
        set("published_by", null);
        set("published_at", null);
      } else if (to === "published") {
        if (row.status !== "approved") {
          throw new AssessmentValidationError(
            "Papers must be approved before publish"
          );
        }
        if (!isAdmin && !isHod && !isOwner) {
          throw new AuthzError("FORBIDDEN", "Cannot publish paper");
        }
        set("published_by", ctx.userId);
        set("published_at", new Date());
      } else if (to === "draft") {
        set("submitted_by", null);
        set("submitted_at", null);
        set("approved_by", null);
        set("approved_at", null);
        set("approval_note", null);
        set("published_by", null);
        set("published_at", null);
      }
      set("status", to);
    }
  }

  if (fields.length === 0) return getQuestionPaperView(ctx, id);
  await pool.query(
    `UPDATE public.question_papers SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $${values.length + 1}`,
    [...values, id] as never[]
  );
  return getQuestionPaperView(ctx, id);
}

export type PaperItemRow = {
  id: string;
  paper_id: string;
  institution_id: string;
  question_bank_item_id: string | null;
  order_number: number;
  question_text_snapshot: string;
  marks: number;
  created_at: Date;
  updated_at: Date;
};

export async function listPaperItems(
  ctx: AuthContext,
  paperId: string
): Promise<PaperItemRow[]> {
  await assertCanAccessPaper(ctx, paperId);
  const result = await pool.query<PaperItemRow>(
    `SELECT * FROM public.question_paper_items
      WHERE paper_id = $1 ORDER BY order_number ASC`,
    [paperId]
  );
  return result.rows;
}

export async function addPaperItem(
  ctx: AuthContext,
  paperId: string,
  input: { questionBankItemId?: string | null; questionText?: string; marks?: number }
): Promise<PaperItemRow> {
  const paper = await assertCanAccessPaper(ctx, paperId);
  const isOwner = paper.owner_id === ctx.userId || paper.created_by === ctx.userId;
  const isAdmin =
    ctx.roleName === ROLES.admin || ctx.roleName === ROLES.systemAdmin;
  const isHod = await (async () => {
    if (ctx.roleName !== ROLES.hod) return false;
    const scope = await getAcademicScope(ctx);
    return scope.headships.some(
      (h) =>
        h.status === "ACTIVE" &&
        h.valid_to === null &&
        h.department_id === paper.department_id
    );
  })();
  if (!isOwner && !isAdmin && !isHod) {
    throw new AuthzError("FORBIDDEN", "Cannot modify this paper");
  }
  if (paper.status === "published" || paper.status === "archived") {
    throw new AssessmentValidationError(
      "Cannot add questions to published/archived paper"
    );
  }

  let snapshot = (input.questionText || "").trim();
  let bankId: string | null = input.questionBankItemId || null;
  const marks = Number(input.marks ?? 1);
  if (!Number.isInteger(marks) || marks < 1) {
    throw new AssessmentValidationError("marks must be integer ≥ 1");
  }

  if (bankId) {
    await assertCanAccessQuestion(ctx, bankId);
    const bank = await loadBankRow(bankId);
    if (!bank) throw new AuthzError("FORBIDDEN", "Question not found");
    if (bank.subject_id !== paper.subject_id) {
      throw new AssessmentValidationError(
        "Question subject does not match paper subject"
      );
    }
    snapshot = bank.question_text;
  } else {
    if (snapshot.length < 2 || snapshot.length > 5000) {
      throw new AssessmentValidationError(
        "questionText must be 2–5000 characters when not using bank item"
      );
    }
    bankId = null;
  }

  const maxOrder = await pool.query<{ next_order: number | null }>(
    `SELECT max(order_number) AS next_order
       FROM public.question_paper_items WHERE paper_id = $1`,
    [paperId]
  );
  const order = (maxOrder.rows[0]?.next_order ?? 0) + 1;

  const inserted = await pool.query<PaperItemRow>(
    `INSERT INTO public.question_paper_items (
        paper_id, institution_id, question_bank_item_id,
        order_number, question_text_snapshot, marks
     ) VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [paperId, paper.institution_id, bankId, order, snapshot, marks]
  );

  await pool.query(
    `UPDATE public.question_papers
        SET total_marks = (
              SELECT COALESCE(sum(marks), 0)
                FROM public.question_paper_items WHERE paper_id = $1
            ),
            version = version + 1,
            updated_at = now()
      WHERE id = $1`,
    [paperId]
  );

  return inserted.rows[0];
}
