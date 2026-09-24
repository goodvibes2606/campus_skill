import { pool } from "@/lib/db";
import {
  AuthzError,
  assertInstitution,
  ROLES,
  type AuthContext,
} from "@/lib/authz";
import { getAcademicScope } from "@/lib/academic-scope";
import {
  AcademicOpsValidationError,
  canTransitionSyllabus,
  isSyllabusSourceType,
  isSyllabusStatus,
  type SyllabusSourceType,
  type SyllabusStatus,
} from "@/lib/academic-ops-types";

/**
 * Syllabus domain (Milestone 5): syllabi, versions, units, topics.
 *
 * Visibility (server-side only):
 * - Student → published syllabi for subjects/program/year of active enrollment
 * - Faculty → own + subjects covered by active assignments (+ coordinator sections)
 * - HOD → headed departments
 * - Admin / system_admin → institution / cross-institution
 * - director_dean → institution published
 */

export type SyllabusRow = {
  id: string;
  institution_id: string;
  department_id: string;
  program_id: string;
  academic_year_id: string;
  subject_id: string;
  title: string;
  description: string;
  version: number;
  status: SyllabusStatus;
  source_type: SyllabusSourceType;
  source_reference: string | null;
  source_notes: string | null;
  source_is_official: boolean;
  created_by: string;
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

export type SyllabusView = SyllabusRow & {
  subject_name: string;
  subject_code: string;
  academic_year_name: string;
  program_code: string;
  department_code: string;
  creator_name: string;
  unit_count: number;
  is_owner: boolean;
};

export type SyllabusUnitRow = {
  id: string;
  syllabus_id: string;
  institution_id: string;
  unit_number: number;
  title: string;
  description: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

export type SyllabusTopicRow = {
  id: string;
  unit_id: string;
  syllabus_id: string;
  institution_id: string;
  topic_number: number;
  title: string;
  description: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

const SELECT_VIEW = `
  SELECT y.*,
         sub.name AS subject_name,
         sub.subject_code,
         ay.name AS academic_year_name,
         p.code AS program_code,
         d.code AS department_code,
         c.full_name AS creator_name,
         (
           SELECT count(*)::int
             FROM public.syllabus_units u
            WHERE u.syllabus_id = y.id
         ) AS unit_count
    FROM public.syllabi y
    JOIN public.subjects sub ON sub.id = y.subject_id
    JOIN public.academic_years ay ON ay.id = y.academic_year_id
    JOIN public.programs p ON p.id = y.program_id
    JOIN public.departments d ON d.id = y.department_id
    JOIN public.profiles c ON c.id = y.created_by
`;

type ScopeFilter = {
  where: string;
  params: unknown[];
};

async function buildVisibilityFilter(
  ctx: AuthContext,
  query: { status?: string; subjectId?: string; academicYearId?: string }
): Promise<ScopeFilter> {
  const params: unknown[] = [];
  const parts: string[] = [];
  const push = (sql: string, ...values: unknown[]) => {
    const start = params.length + 1;
    params.push(...values);
    let i = start;
    parts.push(sql.replace(/\?/g, () => `$${i++}`));
  };

  if (query.status && isSyllabusStatus(query.status)) {
    push(`y.status = ?`, query.status);
  }
  if (query.subjectId) {
    push(`y.subject_id = ?::uuid`, query.subjectId);
  }
  if (query.academicYearId) {
    push(`y.academic_year_id = ?::uuid`, query.academicYearId);
  }

  if (ctx.roleName === ROLES.systemAdmin) {
    // cross-institution
  } else if (ctx.roleName === ROLES.admin) {
    push(`y.institution_id = ?::uuid`, ctx.institutionId);
  } else if (ctx.roleName === ROLES.student) {
    const scope = await getAcademicScope(ctx);
    const enr = scope.enrollment;
    if (!enr || enr.status !== "active") {
      push(`FALSE`);
    } else {
      push(`y.institution_id = ?::uuid`, enr.institution_id);
      push(`y.program_id = ?::uuid`, enr.program_id);
      push(`y.academic_year_id = ?::uuid`, enr.academic_year_id);
      push(`(y.status = 'published' OR y.created_by = ?::uuid)`, ctx.userId);
    }
  } else if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    push(`y.institution_id = ?::uuid`, ctx.institutionId);

    const orClauses: string[] = [];
    const start = params.length + 1;
    let i = start;

    orClauses.push(`y.created_by = $${i++}`);
    params.push(ctx.userId);

    for (const a of scope.facultyAssignments) {
      if (a.status !== "active") continue;
      orClauses.push(
        `(y.subject_id = $${i++} AND y.academic_year_id = $${i++})`
      );
      params.push(a.subject_id, a.academic_year_id);
    }

    if (ctx.roleName === ROLES.hod) {
      for (const h of scope.headships) {
        if (h.status !== "ACTIVE" || h.valid_to !== null) continue;
        orClauses.push(`y.department_id = $${i++}`);
        params.push(h.department_id);
      }
    }

    parts.push(`(${orClauses.join(" OR ")})`);
  } else {
    push(`y.institution_id = ?::uuid`, ctx.institutionId);
    push(`y.status = 'published'`);
  }

  return {
    where: parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "",
    params,
  };
}

export type ListSyllabiQuery = {
  status?: string;
  subjectId?: string;
  academicYearId?: string;
  limit?: number;
};

export async function listVisibleSyllabi(
  ctx: AuthContext,
  query: ListSyllabiQuery = {}
): Promise<SyllabusView[]> {
  const filter = await buildVisibilityFilter(ctx, query);
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const sql = `${SELECT_VIEW}
    ${filter.where}
    ORDER BY y.updated_at DESC
    LIMIT ${limit}`;
  const result = await pool.query<SyllabusView>(
    sql,
    filter.params as never[]
  );
  return result.rows.map((row) => ({
    ...row,
    is_owner: row.created_by === ctx.userId,
  }));
}

async function loadSyllabusRow(id: string): Promise<SyllabusRow | null> {
  const result = await pool.query<SyllabusRow>(
    `SELECT * FROM public.syllabi WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function assertCanAccessSyllabus(
  ctx: AuthContext,
  syllabusId: string
): Promise<SyllabusRow> {
  const row = await loadSyllabusRow(syllabusId);
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Syllabus not found");
  }

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
      row.program_id !== enr.program_id ||
      row.academic_year_id !== enr.academic_year_id
    ) {
      throw new AuthzError(
        "FORBIDDEN",
        "Syllabus outside student academic context"
      );
    }
    if (row.status !== "published" && row.created_by !== ctx.userId) {
      throw new AuthzError("FORBIDDEN", "Syllabus not published");
    }
    return row;
  }

  if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod) {
    assertInstitution(ctx, row.institution_id);
    if (row.created_by === ctx.userId) return row;

    const scope = await getAcademicScope(ctx);
    const covers = scope.facultyAssignments.some(
      (a) =>
        a.status === "active" &&
        a.subject_id === row.subject_id &&
        a.academic_year_id === row.academic_year_id
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
      "No assignment covers this syllabus"
    );
  }

  assertInstitution(ctx, row.institution_id);
  if (row.status !== "published") {
    throw new AuthzError("FORBIDDEN", "Syllabus not published");
  }
  return row;
}

async function resolveSubjectScope(subjectId: string, academicYearId: string) {
  const result = await pool.query<{
    institution_id: string;
    department_id: string;
    program_id: string;
    subject_program_id: string;
    subject_code: string;
  }>(
    `SELECT sub.institution_id,
            p.department_id,
            p.id AS program_id,
            sub.program_id AS subject_program_id,
            sub.subject_code
       FROM public.subjects sub
       JOIN public.programs p ON p.id = sub.program_id
      WHERE sub.id = $1`,
    [subjectId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Subject not found");
  }

  const year = await pool.query<{
    program_id: string;
    institution_id: string;
  }>(
    `SELECT program_id, institution_id
       FROM public.academic_years
      WHERE id = $1`,
    [academicYearId]
  );
  const yearRow = year.rows[0];
  if (!yearRow) {
    throw new AuthzError("FORBIDDEN", "Academic year not found");
  }
  if (yearRow.program_id !== row.program_id) {
    throw new AuthzError(
      "FORBIDDEN",
      "Academic year does not belong to subject program"
    );
  }
  if (yearRow.institution_id !== row.institution_id) {
    throw new AuthzError(
      "FORBIDDEN",
      "Subject and academic year institution mismatch"
    );
  }
  return {
    institution_id: row.institution_id,
    department_id: row.department_id,
    program_id: row.program_id,
    subject_code: row.subject_code,
  };
}

/** Faculty create within active assignment (subject+year); HOD dept; admin inst. */
export async function assertCanCreateSyllabus(
  ctx: AuthContext,
  target: { subjectId: string; academicYearId: string }
): Promise<void> {
  const scopeRow = await resolveSubjectScope(
    target.subjectId,
    target.academicYearId
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
        a.academic_year_id === target.academicYearId
    );
    if (teaches) return;

    throw new AuthzError(
      "FORBIDDEN",
      "No active assignment covers this subject/academic year"
    );
  }

  throw new AuthzError(
    "FORBIDDEN",
    "Only faculty, HOD, or admin may create syllabi"
  );
}

async function snapshotSyllabusVersion(
  row: SyllabusRow,
  userId: string,
  changeNote: string
): Promise<void> {
  await pool.query(
    `INSERT INTO public.syllabus_versions (
        syllabus_id, institution_id, version, status,
        title, description, source_type, source_reference,
        source_notes, source_is_official, change_note, snapshot_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (syllabus_id, version) DO NOTHING`,
    [
      row.id,
      row.institution_id,
      row.version,
      row.status,
      row.title,
      row.description,
      row.source_type,
      row.source_reference,
      row.source_notes,
      row.source_is_official,
      changeNote,
      userId,
    ]
  );
}

export type CreateSyllabusInput = {
  subjectId: string;
  academicYearId: string;
  title: string;
  description?: string;
  sourceType?: string;
  sourceReference?: string | null;
  sourceNotes?: string | null;
  sourceIsOfficial?: boolean;
};

export async function createSyllabus(
  ctx: AuthContext,
  input: CreateSyllabusInput
): Promise<SyllabusView> {
  const title = (input.title || "").trim();
  if (title.length < 2 || title.length > 200) {
    throw new AcademicOpsValidationError(
      "Title must be 2–200 characters"
    );
  }

  await assertCanCreateSyllabus(ctx, {
    subjectId: input.subjectId,
    academicYearId: input.academicYearId,
  });
  const scopeRow = await resolveSubjectScope(
    input.subjectId,
    input.academicYearId
  );

  const sourceType = isSyllabusSourceType(input.sourceType)
    ? input.sourceType
    : "faculty_prepared";

  // Official flag may only be set by admin/system/HOD — faculty cannot claim official.
  const wantsOfficial = input.sourceIsOfficial === true;
  const mayClaimOfficial =
    ctx.roleName === ROLES.admin ||
    ctx.roleName === ROLES.systemAdmin ||
    ctx.roleName === ROLES.directorDean ||
    ctx.roleName === ROLES.hod;
  if (wantsOfficial && !mayClaimOfficial) {
    throw new AcademicOpsValidationError(
      "Only HOD/admin may mark source as official"
    );
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO public.syllabi (
        institution_id, department_id, program_id, academic_year_id,
        subject_id, title, description, source_type, source_reference,
        source_notes, source_is_official, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      scopeRow.institution_id,
      scopeRow.department_id,
      scopeRow.program_id,
      input.academicYearId,
      input.subjectId,
      title,
      (input.description || "").trim().slice(0, 4000),
      sourceType,
      input.sourceReference?.trim() || null,
      input.sourceNotes?.trim().slice(0, 2000) || null,
      wantsOfficial && mayClaimOfficial,
      ctx.userId,
    ]
  );

  const created = await loadSyllabusRow(inserted.rows[0].id);
  if (created) {
    await snapshotSyllabusVersion(created, ctx.userId, "initial");
  }
  return getSyllabusView(ctx, inserted.rows[0].id);
}

export async function getSyllabusView(
  ctx: AuthContext,
  syllabusId: string
): Promise<SyllabusView> {
  await assertCanAccessSyllabus(ctx, syllabusId);
  const view = await pool.query<SyllabusView>(
    `${SELECT_VIEW} WHERE y.id = $1`,
    [syllabusId]
  );
  const out = view.rows[0];
  if (!out) {
    throw new AuthzError("FORBIDDEN", "Syllabus not found");
  }
  return { ...out, is_owner: out.created_by === ctx.userId };
}

export type UpdateSyllabusInput = {
  title?: string;
  description?: string;
  status?: string;
  sourceType?: string;
  sourceReference?: string | null;
  sourceNotes?: string | null;
  sourceIsOfficial?: boolean;
  approvalNote?: string;
};

async function assertCanEditSyllabus(
  ctx: AuthContext,
  row: SyllabusRow
): Promise<void> {
  const isOwner = row.created_by === ctx.userId;
  const isAdmin =
    ctx.roleName === ROLES.admin ||
    ctx.roleName === ROLES.systemAdmin ||
    ctx.roleName === ROLES.directorDean;
  if (isOwner || isAdmin) return;

  if (ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    const heads = scope.headships.some(
      (h) =>
        h.status === "ACTIVE" &&
        h.valid_to === null &&
        h.department_id === row.department_id
    );
    if (heads) return;
  }

  throw new AuthzError(
    "FORBIDDEN",
    "Only owner, HOD, or admin may modify this syllabus"
  );
}

/** Who may approve calendar-like transitions (HOD/admin for syllabus). */
async function assertCanDecideSyllabus(
  ctx: AuthContext,
  row: SyllabusRow
): Promise<void> {
  if (
    ctx.roleName === ROLES.admin ||
    ctx.roleName === ROLES.systemAdmin ||
    ctx.roleName === ROLES.directorDean
  ) {
    return;
  }
  if (ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    const heads = scope.headships.some(
      (h) =>
        h.status === "ACTIVE" &&
        h.valid_to === null &&
        h.department_id === row.department_id
    );
    if (heads) return;
  }
  throw new AuthzError(
    "FORBIDDEN",
    "Only HOD of department or admin may approve/publish syllabus"
  );
}

export async function updateSyllabus(
  ctx: AuthContext,
  syllabusId: string,
  input: UpdateSyllabusInput
): Promise<SyllabusView> {
  const row = await assertCanAccessSyllabus(ctx, syllabusId);

  const fields: string[] = [];
  const values: unknown[] = [];
  let bumpVersion = false;
  let snapshotNote: string | null = null;

  const set = (col: string, val: unknown) => {
    values.push(val);
    fields.push(`${col} = $${values.length}`);
  };

  if (
    input.title !== undefined ||
    input.description !== undefined ||
    input.sourceType !== undefined ||
    input.sourceReference !== undefined ||
    input.sourceNotes !== undefined ||
    input.sourceIsOfficial !== undefined
  ) {
    await assertCanEditSyllabus(ctx, row);
    if (row.status === "published") {
      throw new AcademicOpsValidationError(
        "Unarchive/republish before editing published syllabus content"
      );
    }
  }

  if (input.title !== undefined) {
    const t = input.title.trim();
    if (t.length < 2 || t.length > 200) {
      throw new AcademicOpsValidationError(
        "Title must be 2–200 characters"
      );
    }
    if (t !== row.title) {
      set("title", t);
      bumpVersion = true;
    }
  }
  if (input.description !== undefined) {
    set("description", input.description.trim().slice(0, 4000));
    bumpVersion = true;
  }
  if (input.sourceType !== undefined) {
    if (!isSyllabusSourceType(input.sourceType)) {
      throw new AcademicOpsValidationError("Invalid source type");
    }
    set("source_type", input.sourceType);
    bumpVersion = true;
  }
  if (input.sourceReference !== undefined) {
    set("source_reference", input.sourceReference?.trim() || null);
    bumpVersion = true;
  }
  if (input.sourceNotes !== undefined) {
    set("source_notes", input.sourceNotes?.trim().slice(0, 2000) || null);
    bumpVersion = true;
  }
  if (input.sourceIsOfficial !== undefined) {
    const mayClaimOfficial =
      ctx.roleName === ROLES.admin ||
      ctx.roleName === ROLES.systemAdmin ||
      ctx.roleName === ROLES.directorDean ||
      ctx.roleName === ROLES.hod;
    if (input.sourceIsOfficial && !mayClaimOfficial) {
      throw new AcademicOpsValidationError(
        "Only HOD/admin may mark source as official"
      );
    }
    set("source_is_official", input.sourceIsOfficial === true);
    bumpVersion = true;
  }

  if (input.status !== undefined) {
    if (!isSyllabusStatus(input.status)) {
      throw new AcademicOpsValidationError("Invalid status");
    }
    const to = input.status;
    if (to === row.status) {
      // no-op
    } else if (!canTransitionSyllabus(row.status, to)) {
      throw new AcademicOpsValidationError(
        `Invalid syllabus transition ${row.status} → ${to}`
      );
    } else {
      const deciding =
        to === "approved" || to === "published" || to === "in_review";
      if (to === "approved" || to === "published") {
        await assertCanDecideSyllabus(ctx, row);
        if (ctx.userId === row.created_by && to === "approved") {
          throw new AuthzError(
            "FORBIDDEN",
            "You may not approve a syllabus you created — another approver is required"
          );
        }
      }
      if (to === "in_review" || to === "approved" || to === "archived") {
        await assertCanEditSyllabus(ctx, row);
      }

      set("status", to);
      if (to === "in_review") {
        set("submitted_by", ctx.userId);
        set("submitted_at", new Date());
        snapshotNote = "submitted for review";
      } else if (to === "approved") {
        set("approved_by", ctx.userId);
        set("approved_at", new Date());
        set("approval_note", input.approvalNote?.trim().slice(0, 1000) || null);
        set("published_by", null);
        set("published_at", null);
        snapshotNote = "approved";
      } else if (to === "published") {
        set("published_by", ctx.userId);
        set("published_at", new Date());
        snapshotNote = "published";
      } else if (to === "draft") {
        set("submitted_by", null);
        set("submitted_at", null);
        set("approved_by", null);
        set("approved_at", null);
        set("approval_note", null);
        set("published_by", null);
        set("published_at", null);
        snapshotNote = "returned to draft";
      } else if (to === "archived") {
        snapshotNote = "archived";
      }
      snapshotNote = snapshotNote ?? `status → ${to}`;
    }
  }

  if (fields.length === 0) {
    return getSyllabusView(ctx, syllabusId);
  }

  if (bumpVersion) {
    fields.push(`version = version + 1`);
  }

  await pool.query(
    `UPDATE public.syllabi SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $${values.length + 1}`,
    [...values, syllabusId] as never[]
  );

  const after = await loadSyllabusRow(syllabusId);
  if (after) {
    await snapshotSyllabusVersion(
      after,
      ctx.userId,
      snapshotNote ?? (bumpVersion ? "content edit" : "update")
    );
  }

  return getSyllabusView(ctx, syllabusId);
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export async function listUnits(
  ctx: AuthContext,
  syllabusId: string
): Promise<SyllabusUnitRow[]> {
  await assertCanAccessSyllabus(ctx, syllabusId);
  const result = await pool.query<SyllabusUnitRow>(
    `SELECT * FROM public.syllabus_units
      WHERE syllabus_id = $1
      ORDER BY unit_number ASC`,
    [syllabusId]
  );
  return result.rows;
}

export async function createUnit(
  ctx: AuthContext,
  syllabusId: string,
  input: { unitNumber?: number; title: string; description?: string }
): Promise<SyllabusUnitRow> {
  const row = await assertCanAccessSyllabus(ctx, syllabusId);
  if (row.status === "published" || row.status === "archived") {
    throw new AcademicOpsValidationError(
      "Cannot edit units while syllabus is published/archived"
    );
  }
  await assertCanEditSyllabus(ctx, row);

  const title = (input.title || "").trim();
  if (title.length < 2 || title.length > 200) {
    throw new AcademicOpsValidationError("Unit title must be 2–200 characters");
  }

  let unitNumber = input.unitNumber;
  if (unitNumber === undefined || unitNumber === null) {
    const max = await pool.query<{ next_number: number | null }>(
      `SELECT max(unit_number) AS next_number
         FROM public.syllabus_units WHERE syllabus_id = $1`,
      [syllabusId]
    );
    unitNumber = (max.rows[0]?.next_number ?? 0) + 1;
  }
  if (!Number.isInteger(unitNumber) || unitNumber < 1) {
    throw new AcademicOpsValidationError("unitNumber must be integer ≥ 1");
  }

  try {
    const inserted = await pool.query<SyllabusUnitRow>(
      `INSERT INTO public.syllabus_units (
          syllabus_id, institution_id, unit_number, title, description
       ) VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [
        syllabusId,
        row.institution_id,
        unitNumber,
        title,
        (input.description || "").trim().slice(0, 2000),
      ]
    );
    return inserted.rows[0];
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      throw new AcademicOpsValidationError(
        `Unit number ${unitNumber} already exists`
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

export async function listTopics(
  ctx: AuthContext,
  unitId: string
): Promise<SyllabusTopicRow[]> {
  const unit = await pool.query<SyllabusUnitRow>(
    `SELECT * FROM public.syllabus_units WHERE id = $1`,
    [unitId]
  );
  const unitRow = unit.rows[0];
  if (!unitRow) {
    throw new AuthzError("FORBIDDEN", "Unit not found");
  }
  await assertCanAccessSyllabus(ctx, unitRow.syllabus_id);
  const result = await pool.query<SyllabusTopicRow>(
    `SELECT * FROM public.syllabus_topics
      WHERE unit_id = $1
      ORDER BY topic_number ASC`,
    [unitId]
  );
  return result.rows;
}

export async function createTopic(
  ctx: AuthContext,
  unitId: string,
  input: { topicNumber?: number; title: string; description?: string }
): Promise<SyllabusTopicRow> {
  const unit = await pool.query<SyllabusUnitRow>(
    `SELECT * FROM public.syllabus_units WHERE id = $1`,
    [unitId]
  );
  const unitRow = unit.rows[0];
  if (!unitRow) {
    throw new AuthzError("FORBIDDEN", "Unit not found");
  }
  const syllabus = await assertCanAccessSyllabus(ctx, unitRow.syllabus_id);
  if (syllabus.status === "published" || syllabus.status === "archived") {
    throw new AcademicOpsValidationError(
      "Cannot edit topics while syllabus is published/archived"
    );
  }
  await assertCanEditSyllabus(ctx, syllabus);

  const title = (input.title || "").trim();
  if (title.length < 2 || title.length > 200) {
    throw new AcademicOpsValidationError("Topic title must be 2–200 characters");
  }

  let topicNumber = input.topicNumber;
  if (topicNumber === undefined || topicNumber === null) {
    const max = await pool.query<{ next_number: number | null }>(
      `SELECT max(topic_number) AS next_number
         FROM public.syllabus_topics WHERE unit_id = $1`,
      [unitId]
    );
    topicNumber = (max.rows[0]?.next_number ?? 0) + 1;
  }
  if (!Number.isInteger(topicNumber) || topicNumber < 1) {
    throw new AcademicOpsValidationError("topicNumber must be integer ≥ 1");
  }

  try {
    const inserted = await pool.query<SyllabusTopicRow>(
      `INSERT INTO public.syllabus_topics (
          unit_id, syllabus_id, institution_id, topic_number, title, description
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        unitId,
        unitRow.syllabus_id,
        unitRow.institution_id,
        topicNumber,
        title,
        (input.description || "").trim().slice(0, 2000),
      ]
    );
    return inserted.rows[0];
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      throw new AcademicOpsValidationError(
        `Topic number ${topicNumber} already exists`
      );
    }
    throw error;
  }
}

export type SyllabusVersionRow = {
  id: string;
  syllabus_id: string;
  institution_id: string;
  version: number;
  status: string;
  title: string;
  description: string;
  source_type: string;
  source_reference: string | null;
  source_notes: string | null;
  source_is_official: boolean;
  change_note: string | null;
  snapshot_by: string;
  created_at: Date;
};

export async function listSyllabusVersions(
  ctx: AuthContext,
  syllabusId: string
): Promise<SyllabusVersionRow[]> {
  await assertCanAccessSyllabus(ctx, syllabusId);
  const result = await pool.query<SyllabusVersionRow>(
    `SELECT * FROM public.syllabus_versions
      WHERE syllabus_id = $1
      ORDER BY version DESC, created_at DESC`,
    [syllabusId]
  );
  return result.rows;
}
