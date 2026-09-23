import { pool } from "@/lib/db";
import {
  AuthzError,
  assertInstitution,
  ROLES,
  type AuthContext,
} from "@/lib/authz";
import { getAcademicScope } from "@/lib/academic-scope";
import {
  validateUpload,
  isResourceType,
  isResourceStatus,
  ResourceValidationError,
  type ResourceType,
  type ResourceStatus,
} from "@/lib/resource-types";

/**
 * Academic resource domain (Milestone 4).
 *
 * CRITICAL: all list/get operations filter server-side by the caller's
 * academic scope. Clients never receive resources outside their context.
 *
 * Visibility:
 * - Student  → resources in their active enrollment (section + program/year/semester)
 *              + published status (draft/archived hidden unless owner/admin)
 * - Faculty  → resources they own OR covering their active teaching assignments
 * - HOD      → + resources in departments they head
 * - Admin    → institution-wide
 * - system_admin → any institution
 */

export type AcademicResource = {
  id: string;
  institution_id: string;
  university_id: string;
  department_id: string;
  program_id: string;
  academic_year_id: string;
  semester_id: string;
  section_id: string;
  subject_id: string;
  syllabus_ref: string | null;
  unit_ref: string | null;
  topic_ref: string | null;
  owner_id: string;
  resource_type: ResourceType;
  title: string;
  description: string;
  status: ResourceStatus;
  version: number;
  parent_resource_id: string | null;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_key: string | null;
  created_at: Date;
  updated_at: Date;
};

export type AcademicResourceView = AcademicResource & {
  subject_name: string;
  subject_code: string;
  section_name: string;
  semester_number: number;
  academic_year_name: string;
  program_code: string;
  department_code: string;
  university_code: string;
  owner_name: string;
  is_owner: boolean;
};

type ScopeFilter = {
  /** SQL boolean expression fragments (ANDed), with params already collected */
  where: string;
  params: unknown[];
};

const SELECT_VIEW = `
  SELECT r.*,
         sub.name AS subject_name,
         sub.subject_code,
         sec.name AS section_name,
         sm.semester_number,
         ay.name AS academic_year_name,
         p.code AS program_code,
         d.code AS department_code,
         u.code AS university_code,
         o.full_name AS owner_name
    FROM public.academic_resources r
    JOIN public.subjects sub ON sub.id = r.subject_id
    JOIN public.sections sec ON sec.id = r.section_id
    JOIN public.semesters sm ON sm.id = r.semester_id
    JOIN public.academic_years ay ON ay.id = r.academic_year_id
    JOIN public.programs p ON p.id = r.program_id
    JOIN public.departments d ON d.id = r.department_id
    JOIN public.universities u ON u.id = r.university_id
    JOIN public.profiles o ON o.id = r.owner_id
`;

export type ListResourcesQuery = {
  status?: string;
  resourceType?: string;
  sectionId?: string;
  subjectId?: string;
  limit?: number;
};

/**
 * Build server-side visibility WHERE clause for the caller.
 * Always applied — never optional.
 */
async function buildVisibilityFilter(
  ctx: AuthContext,
  query: ListResourcesQuery
): Promise<ScopeFilter> {
  const params: unknown[] = [];
  const parts: string[] = [];
  const push = (sql: string, ...values: unknown[]) => {
    const start = params.length + 1;
    params.push(...values);
    // Replace ? placeholders with $n
    let i = start;
    parts.push(sql.replace(/\?/g, () => `$${i++}`));
  };

  // Optional filters from query
  if (query.status && isResourceStatus(query.status)) {
    push(`r.status = ?`, query.status);
  }
  if (query.resourceType && isResourceType(query.resourceType)) {
    push(`r.resource_type = ?`, query.resourceType);
  }
  if (query.sectionId) {
    push(`r.section_id = ?::uuid`, query.sectionId);
  }
  if (query.subjectId) {
    push(`r.subject_id = ?::uuid`, query.subjectId);
  }

  // Role-based visibility (server-side only)
  if (ctx.roleName === ROLES.systemAdmin) {
    // any institution — no institution clause
  } else if (ctx.roleName === ROLES.admin) {
    push(`r.institution_id = ?::uuid`, ctx.institutionId);
  } else if (ctx.roleName === ROLES.student) {
    const scope = await getAcademicScope(ctx);
    const enr = scope.enrollment;
    if (!enr || enr.status !== "active") {
      // No enrollment → see nothing
      push(`FALSE`);
    } else {
      push(`r.institution_id = ?::uuid`, enr.institution_id);
      push(`r.section_id = ?::uuid`, enr.section_id);
      push(`r.program_id = ?::uuid`, enr.program_id);
      push(`r.academic_year_id = ?::uuid`, enr.academic_year_id);
      push(`r.semester_id = ?::uuid`, enr.semester_id);
      // Students only see published resources (unless they somehow own one)
      push(`(r.status = 'published' OR r.owner_id = ?::uuid)`, ctx.userId);
    }
  } else if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    push(`r.institution_id = ?::uuid`, ctx.institutionId);

    const orClauses: string[] = [];
    const start = params.length + 1;
    let i = start;

    // Own resources (any status)
    orClauses.push(`r.owner_id = $${i++}`);
    params.push(ctx.userId);

    // Active teaching assignments → section+subject
    for (const a of scope.facultyAssignments) {
      if (a.status !== "active") continue;
      orClauses.push(
        `(r.section_id = $${i++} AND r.subject_id = $${i++})`
      );
      params.push(a.section_id, a.subject_id);
    }

    // Coordinator sections → whole section (any subject in section)
    for (const c of scope.coordinatorSections) {
      orClauses.push(`r.section_id = $${i++}`);
      params.push(c.section_id);
    }

    // HOD departments
    if (ctx.roleName === ROLES.hod) {
      for (const h of scope.headships) {
        if (h.status !== "ACTIVE" || h.valid_to !== null) continue;
        orClauses.push(`r.department_id = $${i++}`);
        params.push(h.department_id);
      }
      // HOD sees published in their department + any status they own already covered
      // department clause above already grants full status in department
    }

    if (orClauses.length === 0) {
      // Faculty with no assignments: only own (already in orClauses) → if only owner, fine
      // If somehow empty, deny
      if (orClauses.length === 0) {
        parts.push(`(FALSE)`);
      }
    } else {
      parts.push(`(${orClauses.join(" OR ")})`);
    }
  } else {
    // director_dean or unknown → institution published only
    push(`r.institution_id = ?::uuid`, ctx.institutionId);
    push(`r.status = 'published'`);
  }

  const where =
    parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "";
  return { where, params };
}

/** List resources visible to the caller (server-side filtered). */
export async function listVisibleResources(
  ctx: AuthContext,
  query: ListResourcesQuery = {}
): Promise<AcademicResourceView[]> {
  const filter = await buildVisibilityFilter(ctx, query);
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);

  const sql = `${SELECT_VIEW}
    ${filter.where}
    ORDER BY r.updated_at DESC
    LIMIT ${limit}`;

  const result = await pool.query<AcademicResourceView>(
    sql,
    filter.params as never[]
  );

  return result.rows.map((row) => ({
    ...row,
    is_owner: row.owner_id === ctx.userId,
  }));
}

/** Load one resource by id with full row (no visibility). */
async function loadResourceRow(
  id: string
): Promise<AcademicResource | null> {
  const result = await pool.query<AcademicResource>(
    `SELECT * FROM public.academic_resources WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Assert the caller may view/manage a specific resource.
 * Server-side only — never trust client claims.
 */
export async function assertCanAccessResource(
  ctx: AuthContext,
  resourceId: string
): Promise<AcademicResource> {
  const row = await loadResourceRow(resourceId);
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Resource not found");
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
      row.section_id !== enr.section_id ||
      row.program_id !== enr.program_id ||
      row.academic_year_id !== enr.academic_year_id ||
      row.semester_id !== enr.semester_id
    ) {
      throw new AuthzError(
        "FORBIDDEN",
        "Resource outside student academic context"
      );
    }
    if (row.status !== "published" && row.owner_id !== ctx.userId) {
      throw new AuthzError("FORBIDDEN", "Resource not published");
    }
    return row;
  }

  if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod) {
    assertInstitution(ctx, row.institution_id);
    if (row.owner_id === ctx.userId) return row;

    const scope = await getAcademicScope(ctx);

    const coversAssignment = scope.facultyAssignments.some(
      (a) =>
        a.status === "active" &&
        a.section_id === row.section_id &&
        a.subject_id === row.subject_id
    );
    if (coversAssignment) return row;

    const coversCoord = scope.coordinatorSections.some(
      (c) => c.section_id === row.section_id
    );
    if (coversCoord) return row;

    if (ctx.roleName === ROLES.hod) {
      const headsDept = scope.headships.some(
        (h) =>
          h.status === "ACTIVE" &&
          h.valid_to === null &&
          h.department_id === row.department_id
      );
      if (headsDept) return row;
    }

    throw new AuthzError(
      "FORBIDDEN",
      "No teaching assignment covers this resource"
    );
  }

  // fallback: institution published
  assertInstitution(ctx, row.institution_id);
  if (row.status !== "published") {
    throw new AuthzError("FORBIDDEN", "Resource not published");
  }
  return row;
}

/** Get a single resource view (visibility-checked). */
export async function getResourceView(
  ctx: AuthContext,
  resourceId: string
): Promise<AcademicResourceView> {
  await assertCanAccessResource(ctx, resourceId);
  const view = await pool.query<AcademicResourceView>(
    `${SELECT_VIEW} WHERE r.id = $1`,
    [resourceId]
  );
  const out = view.rows[0];
  if (!out) {
    throw new AuthzError("FORBIDDEN", "Resource not found");
  }
  return { ...out, is_owner: out.owner_id === ctx.userId };
}

export type CreateResourceInput = {
  sectionId: string;
  subjectId: string;
  resourceType: string;
  title: string;
  description?: string;
  syllabusRef?: string | null;
  unitRef?: string | null;
  topicRef?: string | null;
  status?: string;
  /** optional upload validation */
  upload?: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
  };
};

/**
 * Resolve full academic scope from section+subject and verify consistency.
 * Returns denormalized scope columns for insert.
 */
async function resolveScope(sectionId: string, subjectId: string) {
  const result = await pool.query<{
    institution_id: string;
    university_id: string;
    department_id: string;
    program_id: string;
    academic_year_id: string;
    semester_id: string;
    section_id: string;
    subject_id: string;
    subject_program_id: string;
  }>(
    `SELECT s.institution_id,
            s.semester_id,
            ay.program_id,
            ay.id AS academic_year_id,
            p.department_id,
            d.university_id,
            sub.id AS subject_id,
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
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Section/subject not found");
  }
  if (row.subject_program_id !== row.program_id) {
    throw new AuthzError(
      "FORBIDDEN",
      "Subject does not belong to this section's program"
    );
  }
  return row;
}

/**
 * Assert the caller may create a resource at this scope.
 * Faculty → must have active assignment covering section+subject.
 * HOD → department of section.
 * Admin/system_admin → institution.
 */
export async function assertCanCreateResource(
  ctx: AuthContext,
  target: { sectionId: string; subjectId: string }
): Promise<void> {
  const scopeRow = await resolveScope(target.sectionId, target.subjectId);
  assertInstitution(ctx, scopeRow.institution_id);

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
        h.department_id === scopeRow.department_id
    );
    if (heads) return;
    // HOD may still create if they also teach this section+subject
    const teaches = scope.facultyAssignments.some(
      (a) =>
        a.status === "active" &&
        a.section_id === target.sectionId &&
        a.subject_id === target.subjectId
    );
    if (teaches) return;
    throw new AuthzError(
      "FORBIDDEN",
      "HOD not authorized for this department/assignment"
    );
  }

  if (ctx.roleName === ROLES.faculty) {
    const scope = await getAcademicScope(ctx);
    const teaches = scope.facultyAssignments.some(
      (a) =>
        a.status === "active" &&
        a.section_id === target.sectionId &&
        a.subject_id === target.subjectId
    );
    if (teaches) return;
    // Coordinator of section may also create for any subject in section
    const coords = scope.coordinatorSections.some(
      (c) => c.section_id === target.sectionId
    );
    if (coords) return;
    throw new AuthzError(
      "FORBIDDEN",
      "No active teaching assignment covers this section/subject"
    );
  }

  throw new AuthzError(
    "FORBIDDEN",
    "Only faculty, HOD, or admin may create resources"
  );
}

/** Create a resource after authz + upload validation. */
export async function createResource(
  ctx: AuthContext,
  input: CreateResourceInput
): Promise<AcademicResourceView> {
  if (!isResourceType(input.resourceType)) {
    throw new ResourceValidationError(`Invalid resource type`);
  }
  const title = (input.title || "").trim();
  if (title.length < 2 || title.length > 200) {
    throw new ResourceValidationError(
      "Title must be 2–200 characters"
    );
  }

  await assertCanCreateResource(ctx, {
    sectionId: input.sectionId,
    subjectId: input.subjectId,
  });

  let originalFilename: string | null = null;
  let mimeType: string | null = null;
  let sizeBytes: number | null = null;

  if (input.upload) {
    validateUpload({
      resourceType: input.resourceType,
      filename: input.upload.filename,
      mimeType: input.upload.mimeType,
      sizeBytes: input.upload.sizeBytes,
    });
    originalFilename = input.upload.filename;
    mimeType = input.upload.mimeType;
    sizeBytes = input.upload.sizeBytes;
  }

  const scopeRow = await resolveScope(input.sectionId, input.subjectId);
  const status = isResourceStatus(input.status) ? input.status : "draft";

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO public.academic_resources (
        institution_id, university_id, department_id, program_id,
        academic_year_id, semester_id, section_id, subject_id,
        syllabus_ref, unit_ref, topic_ref,
        owner_id, resource_type, title, description, status,
        original_filename, mime_type, size_bytes, storage_key
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NULL)
     RETURNING id`,
    [
      scopeRow.institution_id,
      scopeRow.university_id,
      scopeRow.department_id,
      scopeRow.program_id,
      scopeRow.academic_year_id,
      scopeRow.semester_id,
      scopeRow.section_id,
      scopeRow.subject_id,
      input.syllabusRef?.trim() || null,
      input.unitRef?.trim() || null,
      input.topicRef?.trim() || null,
      ctx.userId,
      input.resourceType,
      title,
      (input.description || "").trim().slice(0, 2000),
      status,
      originalFilename,
      mimeType,
      sizeBytes,
    ]
  );

  return getResourceView(ctx, inserted.rows[0].id);
}

export type UpdateResourceInput = {
  title?: string;
  description?: string;
  status?: string;
  syllabusRef?: string | null;
  unitRef?: string | null;
  topicRef?: string | null;
};

/**
 * Update metadata/status. Owner may edit; HOD of department and admin may
 * change status (publish/archive). Version increments on content edits.
 */
export async function updateResource(
  ctx: AuthContext,
  resourceId: string,
  input: UpdateResourceInput
): Promise<AcademicResourceView> {
  const row = await assertCanAccessResource(ctx, resourceId);

  const isOwner = row.owner_id === ctx.userId;
  const isAdmin =
    ctx.roleName === ROLES.admin || ctx.roleName === ROLES.systemAdmin;
  const isHodOfDept =
    ctx.roleName === ROLES.hod
      ? await (async () => {
          const scope = await getAcademicScope(ctx);
          return scope.headships.some(
            (h) =>
              h.status === "ACTIVE" &&
              h.valid_to === null &&
              h.department_id === row.department_id
          );
        })()
      : false;

  if (!isOwner && !isAdmin && !isHodOfDept) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only owner, HOD, or admin may modify this resource"
    );
  }

  // Status changes: owner, HOD, admin
  // Content (title/desc/refs): owner only (or admin)
  const fields: string[] = [];
  const values: unknown[] = [];
  let bumpVersion = false;

  const set = (col: string, val: unknown) => {
    values.push(val);
    fields.push(`${col} = $${values.length}`);
  };

  if (input.title !== undefined) {
    if (!isOwner && !isAdmin) {
      throw new AuthzError("FORBIDDEN", "Only owner may edit content");
    }
    const t = input.title.trim();
    if (t.length < 2 || t.length > 200) {
      throw new ResourceValidationError("Title must be 2–200 characters");
    }
    if (t !== row.title) {
      set("title", t);
      bumpVersion = true;
    }
  }
  if (input.description !== undefined) {
    if (!isOwner && !isAdmin) {
      throw new AuthzError("FORBIDDEN", "Only owner may edit content");
    }
    set("description", input.description.trim().slice(0, 2000));
    bumpVersion = true;
  }
  if (input.syllabusRef !== undefined) {
    if (!isOwner && !isAdmin) {
      throw new AuthzError("FORBIDDEN", "Only owner may edit content");
    }
    set("syllabus_ref", input.syllabusRef?.trim() || null);
    bumpVersion = true;
  }
  if (input.unitRef !== undefined) {
    if (!isOwner && !isAdmin) {
      throw new AuthzError("FORBIDDEN", "Only owner may edit content");
    }
    set("unit_ref", input.unitRef?.trim() || null);
    bumpVersion = true;
  }
  if (input.topicRef !== undefined) {
    if (!isOwner && !isAdmin) {
      throw new AuthzError("FORBIDDEN", "Only owner may edit content");
    }
    set("topic_ref", input.topicRef?.trim() || null);
    bumpVersion = true;
  }
  if (input.status !== undefined) {
    if (!isOwner && !isAdmin && !isHodOfDept) {
      throw new AuthzError("FORBIDDEN", "Cannot change status");
    }
    if (!isResourceStatus(input.status)) {
      throw new ResourceValidationError("Invalid status");
    }
    set("status", input.status);
  }

  if (fields.length === 0) {
    return getResourceView(ctx, resourceId);
  }

  if (bumpVersion) {
    fields.push(`version = version + 1`);
  }

  await pool.query(
    `UPDATE public.academic_resources SET ${fields.join(", ")} WHERE id = $${values.length + 1}`,
    [...values, resourceId] as never[]
  );

  return getResourceView(ctx, resourceId);
}
