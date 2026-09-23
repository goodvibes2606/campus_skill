import { pool } from "@/lib/db";
import { AuthzError, type AuthContext } from "@/lib/authz";
import {
  assertPlacementAccess,
  assertPlacementApprove,
  assertPlacementInstitution,
  getPlacementScope,
  scopeCovers,
  type PlacementScope,
} from "@/lib/placement-scope";
import {
  PlacementValidationError,
  canTransitionOpportunity,
  isEmploymentType,
  isOpportunityKind,
  isOpportunityStatus,
  optionalText,
  requireNonEmpty,
} from "@/lib/placement-types";

/**
 * Opportunity foundation (jobs + internships) — Milestone 9.
 *
 * Visibility:
 * - students → open opportunities they are eligible for (enrollment-based).
 * - operators (tpo / assigned placement faculty) → all statuses in scope.
 * - director/oversight → read + approval actions only.
 *
 * Eligibility = simple academic-scope rows (program/department/section/
 * semester range). No rows ⇒ open to every student of the institution.
 * Not a rules engine — foundation only.
 */

export type EligibilityRow = {
  id: string;
  opportunity_id: string;
  institution_id: string;
  department_id: string | null;
  program_id: string | null;
  section_id: string | null;
  semester_from: number | null;
  semester_to: number | null;
  notes: string;
};

export type EligibilityView = EligibilityRow & {
  department_name: string | null;
  program_name: string | null;
  section_name: string | null;
};

export type OpportunityRow = {
  id: string;
  institution_id: string;
  company_id: string;
  title: string;
  description: string;
  opportunity_kind: "job" | "internship";
  employment_type: string | null;
  location: string | null;
  compensation: string | null;
  application_deadline: string | null;
  interview_notes: string;
  department_id: string | null;
  status:
    | "draft"
    | "pending_approval"
    | "approved"
    | "rejected"
    | "open"
    | "closed"
    | "archived";
  created_by: string;
  managed_by: string | null;
  submitted_by: string | null;
  submitted_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  approval_note: string | null;
  opened_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type OpportunityView = OpportunityRow & {
  company_name: string;
  company_status: string;
  creator_name: string;
  approver_name: string | null;
  application_count: number;
  eligibility: EligibilityView[];
};

const SELECT_OPP = `
  SELECT o.*,
         c.name AS company_name,
         c.status AS company_status,
         cr.full_name AS creator_name,
         ap.full_name AS approver_name,
         (
           SELECT count(*)::int FROM public.placement_applications a
            WHERE a.opportunity_id = o.id
         ) AS application_count
    FROM public.placement_opportunities o
    JOIN public.companies c ON c.id = o.company_id
    JOIN public.profiles cr ON cr.id = o.created_by
    LEFT JOIN public.profiles ap ON ap.id = o.approved_by
`;

async function loadEligibility(
  opportunityId: string
): Promise<EligibilityView[]> {
  const result = await pool.query<EligibilityView>(
    `SELECT e.*,
            d.name AS department_name,
            p.name AS program_name,
            s.name AS section_name
       FROM public.placement_opportunity_eligibility e
       LEFT JOIN public.departments d ON d.id = e.department_id
       LEFT JOIN public.programs p ON p.id = e.program_id
       LEFT JOIN public.sections s ON s.id = e.section_id
      WHERE e.opportunity_id = $1
      ORDER BY e.created_at ASC`,
    [opportunityId]
  );
  return result.rows;
}

async function hydrate(
  _ctx: AuthContext,
  row: OpportunityRow
): Promise<OpportunityView> {
  const detail = await pool.query<OpportunityView>(
    `${SELECT_OPP} WHERE o.id = $1`,
    [row.id]
  );
  const out = detail.rows[0];
  if (!out) {
    throw new Error(`Opportunity missing: ${row.id}`);
  }
  return { ...out, eligibility: await loadEligibility(row.id) };
}

export type EligibilityInput = {
  departmentId?: string | null;
  programId?: string | null;
  sectionId?: string | null;
  semesterFrom?: number | null;
  semesterTo?: number | null;
  notes?: string;
};

export type CreateOpportunityInput = {
  companyId: string;
  title: string;
  description?: string;
  opportunityKind?: string;
  employmentType?: string | null;
  location?: string | null;
  compensation?: string | null;
  applicationDeadline?: string | null;
  interviewNotes?: string;
  departmentId?: string | null;
  eligibility?: EligibilityInput[];
  status?: string;
};

async function validateEligibilityRefs(
  scope: PlacementScope,
  institutionId: string,
  eligibility: EligibilityInput[]
): Promise<void> {
  for (const row of eligibility) {
    if (row.departmentId) {
      const d = await pool.query<{ institution_id: string }>(
        `SELECT institution_id FROM public.departments WHERE id = $1`,
        [row.departmentId]
      );
      if (!d.rows[0]) throw new PlacementValidationError("Eligibility department not found");
      assertPlacementInstitution(scope, d.rows[0].institution_id);
      // Scoped operators may only target their own departments.
      if (scope.operateDepartmentIds !== null) {
        if (!scope.operateDepartmentIds.includes(row.departmentId)) {
          throw new AuthzError(
            "FORBIDDEN",
            "Eligibility department is outside your placement scope"
          );
        }
      }
    } else if (scope.operateDepartmentIds !== null) {
      // Department-scoped operators must always name their department.
      throw new AuthzError(
        "FORBIDDEN",
        "Department-scoped placement faculty must restrict eligibility to their department"
      );
    }

    if (row.programId) {
      const p = await pool.query<{ institution_id: string; department_id: string }>(
        `SELECT institution_id, department_id FROM public.programs WHERE id = $1`,
        [row.programId]
      );
      if (!p.rows[0]) throw new PlacementValidationError("Eligibility program not found");
      assertPlacementInstitution(scope, p.rows[0].institution_id);
      if (
        row.departmentId &&
        p.rows[0].department_id !== row.departmentId
      ) {
        throw new PlacementValidationError(
          "Program does not belong to the eligibility department"
        );
      }
      if (
        scope.operateDepartmentIds !== null &&
        !scope.operateDepartmentIds.includes(p.rows[0].department_id)
      ) {
        throw new AuthzError(
          "FORBIDDEN",
          "Eligibility program is outside your placement scope"
        );
      }
    }

    if (row.sectionId) {
      const s = await pool.query<{ institution_id: string }>(
        `SELECT institution_id FROM public.sections WHERE id = $1`,
        [row.sectionId]
      );
      if (!s.rows[0]) throw new PlacementValidationError("Eligibility section not found");
      assertPlacementInstitution(scope, s.rows[0].institution_id);
    }

    if (
      row.semesterFrom != null &&
      row.semesterTo != null &&
      row.semesterTo < row.semesterFrom
    ) {
      throw new PlacementValidationError(
        "semesterTo must be greater than or equal to semesterFrom"
      );
    }
    void institutionId;
  }
}

export async function createOpportunity(
  ctx: AuthContext,
  input: CreateOpportunityInput
): Promise<OpportunityView> {
  const scope = await getPlacementScope(ctx);
  if (scope.access !== "operator" || !scope.canOperate) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only the TPO or assigned placement faculty may create opportunities"
    );
  }
  if (!ctx.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }
  const institutionId = ctx.institutionId;

  const title = requireNonEmpty(input.title, "Title", 160);
  const kind = input.opportunityKind ?? "job";
  if (!isOpportunityKind(kind)) {
    throw new PlacementValidationError("opportunityKind must be 'job' or 'internship'");
  }
  if (input.employmentType != null && !isEmploymentType(input.employmentType)) {
    throw new PlacementValidationError("Invalid employment type");
  }

  const company = await pool.query<{
    id: string;
    institution_id: string;
    status: string;
  }>(
    `SELECT id, institution_id, status FROM public.companies WHERE id = $1`,
    [input.companyId]
  );
  const companyRow = company.rows[0];
  if (!companyRow) {
    throw new PlacementValidationError("Company not found");
  }
  assertPlacementInstitution(scope, companyRow.institution_id);
  if (companyRow.status !== "approved") {
    throw new PlacementValidationError(
      "Opportunities can only be created for approved companies"
    );
  }

  if (input.departmentId) {
    const d = await pool.query<{ institution_id: string }>(
      `SELECT institution_id FROM public.departments WHERE id = $1`,
      [input.departmentId]
    );
    if (!d.rows[0]) throw new PlacementValidationError("Department not found");
    assertPlacementInstitution(scope, d.rows[0].institution_id);
    if (
      scope.operateDepartmentIds !== null &&
      !scope.operateDepartmentIds.includes(input.departmentId)
    ) {
      throw new AuthzError(
        "FORBIDDEN",
        "Department is outside your placement scope"
      );
    }
  } else if (scope.operateDepartmentIds !== null) {
    throw new AuthzError(
      "FORBIDDEN",
      "Department-scoped placement faculty must set a department on the opportunity"
    );
  }

  const eligibility = input.eligibility ?? [];
  if (eligibility.length > 25) {
    throw new PlacementValidationError("At most 25 eligibility rows");
  }
  await validateEligibilityRefs(scope, institutionId, eligibility);

  const status = input.status === "pending_approval" ? "pending_approval" : "draft";

  const inserted = await pool.query<OpportunityRow>(
    `INSERT INTO public.placement_opportunities (
        institution_id, company_id, title, description, opportunity_kind,
        employment_type, location, compensation, application_deadline,
        interview_notes, department_id, status,
        created_by, managed_by, submitted_by, submitted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
               $13, $13,
               CASE WHEN $12 = 'pending_approval' THEN $13::uuid END,
               CASE WHEN $12 = 'pending_approval' THEN now() END)
     RETURNING *`,
    [
      institutionId,
      input.companyId,
      title,
      optionalText(input.description, "description", 8000),
      kind,
      input.employmentType ?? null,
      optionalText(input.location, "location", 200) || null,
      optionalText(input.compensation, "compensation", 300) || null,
      input.applicationDeadline || null,
      optionalText(input.interviewNotes, "interviewNotes", 4000),
      input.departmentId ?? null,
      status,
      ctx.userId,
    ]
  );
  const opp = inserted.rows[0];

  for (const row of eligibility) {
    await pool.query(
      `INSERT INTO public.placement_opportunity_eligibility (
          opportunity_id, institution_id, department_id, program_id,
          section_id, semester_from, semester_to, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        opp.id,
        institutionId,
        row.departmentId ?? null,
        row.programId ?? null,
        row.sectionId ?? null,
        row.semesterFrom ?? null,
        row.semesterTo ?? null,
        optionalText(row.notes, "notes", 500),
      ]
    );
  }

  return hydrate(ctx, opp);
}

export async function getOpportunity(
  ctx: AuthContext,
  opportunityId: string
): Promise<OpportunityView> {
  const scope = await getPlacementScope(ctx);
  assertPlacementAccess(scope, "student", "operator", "approver", "oversight");

  const result = await pool.query<OpportunityRow>(
    `SELECT * FROM public.placement_opportunities WHERE id = $1`,
    [opportunityId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Opportunity not found");
  }
  assertPlacementInstitution(scope, row.institution_id);

  if (scope.access === "student") {
    if (!["approved", "open", "closed"].includes(row.status)) {
      throw new AuthzError("FORBIDDEN", "Opportunity not available");
    }
  }
  return hydrate(ctx, row);
}

export type ListOpportunitiesQuery = {
  status?: string;
  kind?: string;
  companyId?: string;
  search?: string;
  /** Student mode: only open + eligible. */
  eligibleOnly?: boolean;
  limit?: number;
};

export async function listOpportunities(
  ctx: AuthContext,
  query: ListOpportunitiesQuery = {}
): Promise<OpportunityView[]> {
  const scope = await getPlacementScope(ctx);
  assertPlacementAccess(scope, "student", "operator", "approver", "oversight");
  const institutionId = ctx.institutionId;
  if (!institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }

  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const params: unknown[] = [institutionId];
  const clauses: string[] = [];

  if (scope.access === "student") {
    clauses.push(`o.status = 'open'`);
    if (query.kind) {
      params.push(query.kind);
      clauses.push(`o.opportunity_kind = $${params.length}`);
    }
    // Deadline filter (open or future/null)
    clauses.push(
      `(o.application_deadline IS NULL OR o.application_deadline >= current_date)`
    );
    // Eligibility: no rows = open to all; else must match active enrollment.
    const enr = await pool.query<{
      program_id: string;
      section_id: string;
      semester_number: number;
      department_id: string;
    }>(
      `SELECT ay.program_id, sec.id AS section_id, sm.semester_number, pr.department_id
         FROM public.student_enrollments e
         JOIN public.programs pr ON pr.id = e.program_id
         JOIN public.academic_years ay ON ay.id = e.academic_year_id
         JOIN public.semesters sm ON sm.id = e.semester_id
         JOIN public.sections sec ON sec.id = e.section_id
        WHERE e.student_id = $1 AND e.status = 'active'
        LIMIT 1`,
      [ctx.userId]
    );
    const enrollment = enr.rows[0];
    if (!enrollment) {
      // No enrollment → cannot evaluate eligibility → show nothing.
      return [];
    }
    params.push(enrollment.program_id, enrollment.section_id, enrollment.semester_number, enrollment.department_id, ctx.userId);
    const programIdx = params.length - 4;
    const sectionIdx = params.length - 3;
    const semIdx = params.length - 2;
    const deptIdx = params.length - 1;
    const userIdx = params.length;
    clauses.push(`(
      NOT EXISTS (
        SELECT 1 FROM public.placement_opportunity_eligibility ge
         WHERE ge.opportunity_id = o.id
      )
      OR EXISTS (
        SELECT 1 FROM public.placement_opportunity_eligibility e2
         WHERE e2.opportunity_id = o.id
           AND (e2.program_id IS NULL OR e2.program_id = $${programIdx})
           AND (e2.department_id IS NULL OR e2.department_id = $${deptIdx})
           AND (e2.section_id IS NULL OR e2.section_id = $${sectionIdx})
           AND (e2.semester_from IS NULL OR e2.semester_from <= $${semIdx})
           AND (e2.semester_to IS NULL OR e2.semester_to >= $${semIdx})
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.placement_applications ax
         WHERE ax.opportunity_id = o.id AND ax.student_id = $${userIdx}
      )
    )`);
  } else {
    if (query.status) {
      params.push(query.status);
      clauses.push(`o.status = $${params.length}`);
    }
    if (query.kind) {
      params.push(query.kind);
      clauses.push(`o.opportunity_kind = $${params.length}`);
    }
    if (query.companyId) {
      params.push(query.companyId);
      clauses.push(`o.company_id = $${params.length}`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      clauses.push(`(o.title ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
    }
    // Scoped operators only see their department's opportunities (+ their own drafts).
    if (scope.access === "operator" && scope.operateDepartmentIds !== null) {
      params.push(scope.operateDepartmentIds);
      params.push(ctx.userId);
      clauses.push(`(
        o.department_id = ANY($${params.length - 1}::uuid[])
        OR (o.department_id IS NULL AND o.created_by = $${params.length})
      )`);
    }
  }

  params.push(limit);
  const where = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
  const result = await pool.query<OpportunityRow>(
    `${SELECT_OPP}
      WHERE o.institution_id = $1 ${where}
      ORDER BY o.updated_at DESC
      LIMIT $${params.length}`,
    params
  );
  return Promise.all(result.rows.map((r) => hydrate(ctx, r)));
}

export async function updateOpportunity(
  ctx: AuthContext,
  opportunityId: string,
  input: {
    title?: string;
    description?: string;
    location?: string;
    compensation?: string;
    applicationDeadline?: string | null;
    interviewNotes?: string;
    employmentType?: string | null;
    eligibility?: EligibilityInput[];
    status?: string;
    note?: string;
  }
): Promise<OpportunityView> {
  const scope = await getPlacementScope(ctx);
  const existing = await pool.query<OpportunityRow>(
    `SELECT * FROM public.placement_opportunities WHERE id = $1`,
    [opportunityId]
  );
  const row = existing.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Opportunity not found");
  }
  assertPlacementInstitution(scope, row.institution_id);

  const wantsStatus = input.status !== undefined;
  const wantsContentEdit =
    input.title !== undefined ||
    input.description !== undefined ||
    input.location !== undefined ||
    input.compensation !== undefined ||
    input.applicationDeadline !== undefined ||
    input.interviewNotes !== undefined ||
    input.employmentType !== undefined ||
    input.eligibility !== undefined;

  if (wantsStatus) {
    if (!isOpportunityStatus(input.status)) {
      throw new PlacementValidationError("Invalid opportunity status");
    }
    return transitionOpportunity(ctx, row, input.status, input.note);
  }

  if (scope.access !== "operator") {
    throw new AuthzError(
      "FORBIDDEN",
      "Only placement operators may edit opportunity details"
    );
  }
  if (!scopeCovers(scope, row)) {
    throw new AuthzError(
      "FORBIDDEN",
      "Your placement responsibility does not cover this opportunity"
    );
  }
  if (!["draft", "rejected"].includes(row.status)) {
    throw new PlacementValidationError(
      "Opportunity details can only be edited while draft or rejected"
    );
  }
  if (!wantsContentEdit) {
    throw new PlacementValidationError("Nothing to update");
  }

  if (input.employmentType != null && !isEmploymentType(input.employmentType)) {
    throw new PlacementValidationError("Invalid employment type");
  }
  if (input.applicationDeadline !== undefined && input.applicationDeadline === "") {
    input.applicationDeadline = null;
  }

  await pool.query(
    `UPDATE public.placement_opportunities SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        location = COALESCE($4, location),
        compensation = COALESCE($5, compensation),
        application_deadline = CASE WHEN $6::boolean THEN $7::date ELSE application_deadline END,
        interview_notes = COALESCE($8, interview_notes),
        employment_type = CASE WHEN $9::boolean THEN $10 ELSE employment_type END
      WHERE id = $1`,
    [
      opportunityId,
      input.title !== undefined ? requireNonEmpty(input.title, "Title", 160) : null,
      input.description !== undefined ? optionalText(input.description, "description", 8000) : null,
      input.location !== undefined ? optionalText(input.location, "location", 200) || null : null,
      input.compensation !== undefined ? optionalText(input.compensation, "compensation", 300) || null : null,
      input.applicationDeadline !== undefined,
      input.applicationDeadline ?? null,
      input.interviewNotes !== undefined ? optionalText(input.interviewNotes, "interviewNotes", 4000) : null,
      input.employmentType !== undefined,
      input.employmentType ?? null,
    ]
  );

  if (input.eligibility !== undefined) {
    if (input.eligibility.length > 25) {
      throw new PlacementValidationError("At most 25 eligibility rows");
    }
    await validateEligibilityRefs(scope, row.institution_id, input.eligibility);
    await pool.query(
      `DELETE FROM public.placement_opportunity_eligibility WHERE opportunity_id = $1`,
      [opportunityId]
    );
    for (const er of input.eligibility) {
      await pool.query(
        `INSERT INTO public.placement_opportunity_eligibility (
            opportunity_id, institution_id, department_id, program_id,
            section_id, semester_from, semester_to, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          opportunityId,
          row.institution_id,
          er.departmentId ?? null,
          er.programId ?? null,
          er.sectionId ?? null,
          er.semesterFrom ?? null,
          er.semesterTo ?? null,
          optionalText(er.notes, "notes", 500),
        ]
      );
    }
  }

  return getOpportunity(ctx, opportunityId);
}

async function transitionOpportunity(
  ctx: AuthContext,
  row: OpportunityRow,
  to: import("@/lib/placement-types").OpportunityStatus,
  note?: string
): Promise<OpportunityView> {
  const scope = await getPlacementScope(ctx);
  if (!canTransitionOpportunity(row.status, to)) {
    throw new PlacementValidationError(
      `Cannot move opportunity from ${row.status} to ${to}`
    );
  }

  const approvalStep = to === "approved" || to === "rejected";
  const operatorStep =
    to === "pending_approval" ||
    to === "draft" ||
    to === "open" ||
    to === "closed" ||
    to === "archived";

  if (approvalStep) {
    assertPlacementApprove(scope);
    if (row.status !== "pending_approval") {
      throw new PlacementValidationError(
        "Only opportunities pending approval can be approved or rejected"
      );
    }
    const updated = await pool.query<OpportunityRow>(
      `UPDATE public.placement_opportunities SET
          status = $2,
          approved_by = CASE WHEN $2 = 'approved' THEN $3::uuid ELSE approved_by END,
          approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE approved_at END,
          rejected_by = CASE WHEN $2 = 'rejected' THEN $3::uuid ELSE rejected_by END,
          rejected_at = CASE WHEN $2 = 'rejected' THEN now() ELSE rejected_at END,
          approval_note = COALESCE($4, approval_note)
        WHERE id = $1 AND status = 'pending_approval'
        RETURNING *`,
      [row.id, to, ctx.userId, optionalText(note, "note", 1000) || null]
    );
    if (!updated.rows[0]) {
      throw new PlacementValidationError("Opportunity already decided");
    }
    return hydrate(ctx, row);
  }

  if (!operatorStep) {
    throw new AuthzError("FORBIDDEN", "Status change not authorized");
  }
  if (scope.access !== "operator") {
    throw new AuthzError(
      "FORBIDDEN",
      "Only placement operators may move opportunities through the workflow"
    );
  }
  if (!scopeCovers(scope, row)) {
    throw new AuthzError(
      "FORBIDDEN",
      "Your placement responsibility does not cover this opportunity"
    );
  }
  if (to === "open" && row.status !== "approved") {
    throw new PlacementValidationError("Opportunity must be approved before opening");
  }
  if (to === "open") {
    const company = await pool.query<{ status: string }>(
      `SELECT status FROM public.companies WHERE id = $1`,
      [row.company_id]
    );
    if (company.rows[0]?.status !== "approved") {
      throw new PlacementValidationError(
        "Company must be approved before opening"
      );
    }
  }

  const updated = await pool.query<OpportunityRow>(
    `UPDATE public.placement_opportunities SET
        status = $2,
        submitted_by = CASE WHEN $2 = 'pending_approval' THEN $3::uuid ELSE submitted_by END,
        submitted_at = CASE WHEN $2 = 'pending_approval' THEN now() ELSE submitted_at END,
        opened_at = CASE WHEN $2 = 'open' THEN COALESCE(opened_at, now()) ELSE opened_at END,
        closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE closed_at END,
        approval_note = COALESCE($4, approval_note)
      WHERE id = $1 AND status = $5
      RETURNING *`,
    [row.id, to, ctx.userId, optionalText(note, "note", 1000) || null, row.status]
  );
  if (!updated.rows[0]) {
    throw new PlacementValidationError("Opportunity status already changed");
  }
  return hydrate(ctx, row);
}
