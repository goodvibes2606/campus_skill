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
  canTransitionMst,
  isMstStatus,
  parseDateOnly,
  type MstStatus,
} from "@/lib/assessment-types";
import {
  assertCanCreatePaper,
  createQuestionPaper,
} from "@/lib/question-bank";

/**
 * MST-1 and MST-2 records (Milestone 6).
 * Lifecycle + review/approval foundation; optional linked question paper.
 * Unique one MST-N per section+subject+academic_year.
 */

export type MstRow = {
  id: string;
  institution_id: string;
  university_id: string;
  department_id: string;
  program_id: string;
  academic_year_id: string;
  semester_id: string;
  section_id: string;
  subject_id: string;
  mst_number: 1 | 2;
  owner_id: string;
  created_by: string;
  title: string;
  description: string;
  scheduled_on: string | Date | null;
  max_marks: number;
  question_paper_id: string | null;
  status: MstStatus;
  submitted_by: string | null;
  submitted_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  approval_note: string | null;
  published_by: string | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type MstView = MstRow & {
  subject_name: string;
  subject_code: string;
  section_name: string;
  academic_year_name: string;
  owner_name: string;
  is_owner: boolean;
};

const SELECT_MST = `
  SELECT m.*,
         sub.name AS subject_name,
         sub.subject_code,
         sec.name AS section_name,
         ay.name AS academic_year_name,
         o.full_name AS owner_name
    FROM public.mid_semester_tests m
    JOIN public.subjects sub ON sub.id = m.subject_id
    JOIN public.sections sec ON sec.id = m.section_id
    JOIN public.academic_years ay ON ay.id = m.academic_year_id
    JOIN public.profiles o ON o.id = m.owner_id
`;

async function buildMstFilter(
  ctx: AuthContext,
  query: { status?: string; mstNumber?: number; sectionId?: string; subjectId?: string }
): Promise<{ where: string; params: unknown[] }> {
  const params: unknown[] = [];
  const parts: string[] = [];
  const push = (sql: string, ...values: unknown[]) => {
    const start = params.length + 1;
    params.push(...values);
    let i = start;
    parts.push(sql.replace(/\?/g, () => `$${i++}`));
  };

  if (query.status && isMstStatus(query.status)) {
    push(`m.status = ?`, query.status);
  }
  if (query.mstNumber === 1 || query.mstNumber === 2) {
    push(`m.mst_number = ?`, query.mstNumber);
  }
  if (query.sectionId) {
    push(`m.section_id = ?::uuid`, query.sectionId);
  }
  if (query.subjectId) {
    push(`m.subject_id = ?::uuid`, query.subjectId);
  }

  if (ctx.roleName === ROLES.systemAdmin) {
    // any
  } else if (ctx.roleName === ROLES.admin) {
    push(`m.institution_id = ?::uuid`, ctx.institutionId);
  } else if (ctx.roleName === ROLES.student) {
    const scope = await getAcademicScope(ctx);
    const enr = scope.enrollment;
    if (!enr || enr.status !== "active") {
      push(`FALSE`);
    } else {
      push(`m.institution_id = ?::uuid`, enr.institution_id);
      push(`m.section_id = ?::uuid`, enr.section_id);
      push(
        `m.subject_id IN (
          SELECT ss.subject_id FROM public.section_subjects ss
           WHERE ss.section_id = ?::uuid
        )`,
        enr.section_id
      );
      push(`(m.status = 'published' OR m.owner_id = ?::uuid)`, ctx.userId);
    }
  } else if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    push(`m.institution_id = ?::uuid`, ctx.institutionId);
    const ors: string[] = [];
    const start = params.length + 1;
    let i = start;
    ors.push(`m.owner_id = $${i++}`);
    params.push(ctx.userId);
    for (const a of scope.facultyAssignments) {
      if (a.status !== "active") continue;
      ors.push(`(m.section_id = $${i++} AND m.subject_id = $${i++})`);
      params.push(a.section_id, a.subject_id);
    }
    if (ctx.roleName === ROLES.hod) {
      for (const h of scope.headships) {
        if (h.status !== "ACTIVE" || h.valid_to !== null) continue;
        ors.push(`m.department_id = $${i++}`);
        params.push(h.department_id);
      }
    }
    parts.push(`(${ors.join(" OR ")})`);
  } else {
    push(`m.institution_id = ?::uuid`, ctx.institutionId);
    push(`m.status = 'published'`);
  }

  return {
    where: parts.length ? `WHERE ${parts.join(" AND ")}` : "",
    params,
  };
}

export async function listMsts(
  ctx: AuthContext,
  query: {
    status?: string;
    mstNumber?: number;
    sectionId?: string;
    subjectId?: string;
    limit?: number;
  } = {}
): Promise<MstView[]> {
  const filter = await buildMstFilter(ctx, query);
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const result = await pool.query<MstView>(
    `${SELECT_MST} ${filter.where}
     ORDER BY m.mst_number ASC, m.scheduled_on NULLS LAST, m.updated_at DESC
     LIMIT ${limit}`,
    filter.params as never[]
  );
  return result.rows.map((row) => ({
    ...row,
    is_owner: row.owner_id === ctx.userId || row.created_by === ctx.userId,
  }));
}

async function loadMstRow(id: string): Promise<MstRow | null> {
  const r = await pool.query<MstRow>(
    `SELECT * FROM public.mid_semester_tests WHERE id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function assertCanAccessMst(
  ctx: AuthContext,
  id: string
): Promise<MstRow> {
  const row = await loadMstRow(id);
  if (!row) throw new AuthzError("FORBIDDEN", "MST not found");

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
    if (row.section_id !== enr.section_id) {
      throw new AuthzError("FORBIDDEN", "MST outside enrolled section");
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
      throw new AuthzError("FORBIDDEN", "MST not published");
    }
    return row;
  }

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
  if (row.status === "published") return row;
  throw new AuthzError(
    "FORBIDDEN",
    "No teaching assignment covers this MST"
  );
}

export type CreateMstInput = {
  sectionId: string;
  subjectId: string;
  mstNumber: number;
  title: string;
  description?: string;
  scheduledOn?: string | null;
  maxMarks?: number;
  questionPaperId?: string | null;
  status?: string;
  /** When true, create a linked question paper draft first */
  createPaper?: boolean;
};

export async function createMst(
  ctx: AuthContext,
  input: CreateMstInput
): Promise<MstView> {
  const title = (input.title || "").trim();
  if (title.length < 2 || title.length > 200) {
    throw new AssessmentValidationError("Title must be 2–200 characters");
  }
  const mstNumber = Number(input.mstNumber);
  if (mstNumber !== 1 && mstNumber !== 2) {
    throw new AssessmentValidationError("mstNumber must be 1 (MST-1) or 2 (MST-2)");
  }

  await assertCanCreatePaper(ctx, {
    sectionId: input.sectionId,
    subjectId: input.subjectId,
  });

  const scope = await pool.query<{
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
    [input.sectionId, input.subjectId]
  );
  const sc = scope.rows[0];
  if (!sc) throw new AuthzError("FORBIDDEN", "Section/subject not found");
  if (sc.subject_program_id !== sc.program_id) {
    throw new AuthzError("FORBIDDEN", "Subject/section program mismatch");
  }

  let scheduledOn: string | null = null;
  if (input.scheduledOn) {
    scheduledOn = parseDateOnly(input.scheduledOn, "scheduledOn");
  }

  const maxMarks = Number(input.maxMarks ?? 40);
  if (!Number.isInteger(maxMarks) || maxMarks <= 0) {
    throw new AssessmentValidationError("maxMarks must be integer > 0");
  }

  let status: MstStatus = "draft";
  if (input.status !== undefined) {
    if (!isMstStatus(input.status)) {
      throw new AssessmentValidationError("Invalid status");
    }
    if (!["draft", "in_review"].includes(input.status)) {
      throw new AssessmentValidationError(
        "New MST may only start as draft or in_review"
      );
    }
    status = input.status;
  }

  let questionPaperId: string | null = input.questionPaperId || null;
  if (input.createPaper) {
    const paper = await createQuestionPaper(ctx, {
      sectionId: input.sectionId,
      subjectId: input.subjectId,
      title: `${title} (MST-${mstNumber} paper)`,
      description: input.description || "",
      paperKind: "mst",
      totalMarks: maxMarks,
      status: "draft",
    });
    questionPaperId = paper.id;
  }
  if (questionPaperId) {
    const paper = await pool.query<{
      id: string;
      institution_id: string;
      section_id: string | null;
      subject_id: string;
    }>(
      `SELECT id, institution_id, section_id, subject_id
         FROM public.question_papers WHERE id = $1`,
      [questionPaperId]
    );
    const p = paper.rows[0];
    if (!p) throw new AuthzError("FORBIDDEN", "Question paper not found");
    assertInstitution(ctx, p.institution_id);
    if (p.subject_id !== input.subjectId) {
      throw new AssessmentValidationError(
        "Question paper subject does not match MST subject"
      );
    }
    if (p.section_id !== null && p.section_id !== input.sectionId) {
      throw new AssessmentValidationError(
        "Question paper section does not match MST section"
      );
    }
  }

  try {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO public.mid_semester_tests (
          institution_id, university_id, department_id, program_id,
          academic_year_id, semester_id, section_id, subject_id,
          mst_number, owner_id, created_by, title, description,
          scheduled_on, max_marks, question_paper_id, status,
          submitted_by, submitted_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [
        sc.institution_id,
        sc.university_id,
        sc.department_id,
        sc.program_id,
        sc.academic_year_id,
        sc.semester_id,
        input.sectionId,
        input.subjectId,
        mstNumber,
        ctx.userId,
        ctx.userId,
        title,
        (input.description || "").trim().slice(0, 4000),
        scheduledOn,
        maxMarks,
        questionPaperId,
        status,
        status === "in_review" ? ctx.userId : null,
        status === "in_review" ? new Date() : null,
      ]
    );
    return getMstView(ctx, inserted.rows[0].id);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      throw new AssessmentValidationError(
        `MST-${mstNumber} already exists for this section/subject/year`
      );
    }
    throw error;
  }
}

export async function getMstView(
  ctx: AuthContext,
  id: string
): Promise<MstView> {
  await assertCanAccessMst(ctx, id);
  const view = await pool.query<MstView>(`${SELECT_MST} WHERE m.id = $1`, [id]);
  const out = view.rows[0];
  if (!out) throw new AuthzError("FORBIDDEN", "MST not found");
  return {
    ...out,
    is_owner: out.owner_id === ctx.userId || out.created_by === ctx.userId,
  };
}

export async function updateMst(
  ctx: AuthContext,
  id: string,
  input: {
    title?: string;
    description?: string;
    scheduledOn?: string | null;
    maxMarks?: number;
    questionPaperId?: string | null;
    status?: string;
    approvalNote?: string;
  }
): Promise<MstView> {
  const row = await assertCanAccessMst(ctx, id);
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
      "Only owner, HOD, or admin may modify this MST"
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
  }
  if (input.description !== undefined && row.status !== "published") {
    set("description", input.description.trim().slice(0, 4000));
  }
  if (input.scheduledOn !== undefined) {
    if (input.scheduledOn === null || input.scheduledOn === "") {
      set("scheduled_on", null);
    } else {
      set("scheduled_on", parseDateOnly(input.scheduledOn, "scheduledOn"));
    }
  }
  if (input.maxMarks !== undefined) {
    const n = Number(input.maxMarks);
    if (!Number.isInteger(n) || n <= 0) {
      throw new AssessmentValidationError("maxMarks must be > 0");
    }
    set("max_marks", n);
  }
  if (input.questionPaperId !== undefined) {
    const pid = input.questionPaperId || null;
    if (pid) {
      const p = await pool.query<{
        institution_id: string;
        subject_id: string;
        section_id: string | null;
      }>(
        `SELECT institution_id, subject_id, section_id
           FROM public.question_papers WHERE id = $1`,
        [pid]
      );
      const paper = p.rows[0];
      if (!paper) throw new AuthzError("FORBIDDEN", "Paper not found");
      assertInstitution(ctx, paper.institution_id);
      if (paper.subject_id !== row.subject_id) {
        throw new AssessmentValidationError("Paper subject mismatch");
      }
      if (paper.section_id !== null && paper.section_id !== row.section_id) {
        throw new AssessmentValidationError("Paper section mismatch");
      }
    }
    set("question_paper_id", pid);
  }

  if (input.status !== undefined) {
    if (!isMstStatus(input.status)) {
      throw new AssessmentValidationError("Invalid status");
    }
    const to = input.status;
    if (to !== row.status) {
      if (!canTransitionMst(row.status, to)) {
        throw new AssessmentValidationError(
          `Invalid MST transition ${row.status} → ${to}`
        );
      }
      if (to === "approved") {
        if (!isAdmin && !isHod) {
          throw new AuthzError(
            "FORBIDDEN",
            "MST approval requires HOD or admin"
          );
        }
        set("approved_by", ctx.userId);
        set("approved_at", new Date());
        set("approval_note", input.approvalNote?.trim().slice(0, 1000) || null);
        set("published_by", null);
        set("published_at", null);
      } else if (to === "in_review") {
        set("submitted_by", ctx.userId);
        set("submitted_at", new Date());
      } else if (to === "published") {
        if (row.status !== "approved") {
          throw new AssessmentValidationError(
            "MST must be approved before publish"
          );
        }
        if (!isAdmin && !isHod && !isOwner) {
          throw new AuthzError("FORBIDDEN", "Cannot publish MST");
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

  if (fields.length === 0) return getMstView(ctx, id);
  await pool.query(
    `UPDATE public.mid_semester_tests SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $${values.length + 1}`,
    [...values, id] as never[]
  );
  return getMstView(ctx, id);
}
