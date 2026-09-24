import { pool } from "@/lib/db";
import { AuthzError, type AuthContext } from "@/lib/authz";
import {
  assertPlacementAccess,
  assertPlacementApprove,
  assertPlacementInstitution,
  getPlacementScope,
} from "@/lib/placement-scope";
import {
  PlacementValidationError,
  canTransitionCompany,
  isCompanyStatus,
  optionalText,
  requireNonEmpty,
} from "@/lib/placement-types";

/**
 * Company foundation services (Milestone 9).
 * Institution-isolated; approval by Director/Dean only.
 */

export type CompanyRow = {
  id: string;
  institution_id: string;
  name: string;
  website: string | null;
  industry: string | null;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "archived";
  created_by: string;
  submitted_by: string | null;
  submitted_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  approval_note: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CompanyView = CompanyRow & {
  creator_name: string;
  approver_name: string | null;
  opportunity_count: number;
};

const SELECT_COMPANY = `
  SELECT c.*,
         cr.full_name AS creator_name,
         ap.full_name AS approver_name,
         (
           SELECT count(*)::int FROM public.placement_opportunities o
            WHERE o.company_id = c.id
         ) AS opportunity_count
    FROM public.companies c
    JOIN public.profiles cr ON cr.id = c.created_by
    LEFT JOIN public.profiles ap ON ap.id = c.approved_by
`;

export type CreateCompanyInput = {
  name: string;
  website?: string;
  industry?: string;
  location?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  status?: string;
};

export async function createCompany(
  ctx: AuthContext,
  input: CreateCompanyInput
): Promise<CompanyView> {
  const scope = await getPlacementScope(ctx);
  assertPlacementOperateStrict(scope, "company");
  const institutionId = requireInstitutionId(ctx);

  const name = requireNonEmpty(input.name, "Company name", 120);

  const status =
    input.status === "pending_approval" ? "pending_approval" : "draft";

  const inserted = await pool.query<CompanyRow>(
    `INSERT INTO public.companies (
        institution_id, name, website, industry, location,
        contact_name, contact_email, contact_phone, notes,
        status, created_by, submitted_by, submitted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
               $11, CASE WHEN $10 = 'pending_approval' THEN now() END)
     RETURNING *`,
    [
      institutionId,
      name,
      optionalText(input.website, "website", 300) || null,
      optionalText(input.industry, "industry", 120) || null,
      optionalText(input.location, "location", 200) || null,
      optionalText(input.contactName, "contactName", 120) || null,
      optionalText(input.contactEmail, "contactEmail", 200) || null,
      optionalText(input.contactPhone, "contactPhone", 50) || null,
      optionalText(input.notes, "notes", 4000),
      status,
      ctx.userId,
    ]
  );

  return getCompany(ctx, inserted.rows[0].id);
}

export async function getCompany(
  ctx: AuthContext,
  companyId: string
): Promise<CompanyView> {
  const scope = await getPlacementScope(ctx);
  assertPlacementAccess(scope, "operator", "approver", "oversight");
  const result = await pool.query<CompanyView>(
    `${SELECT_COMPANY} WHERE c.id = $1`,
    [companyId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Company not found");
  }
  assertPlacementInstitution(scope, row.institution_id);
  return row;
}

export type ListCompaniesQuery = {
  status?: string;
  search?: string;
  limit?: number;
};

export async function listCompanies(
  ctx: AuthContext,
  query: ListCompaniesQuery = {}
): Promise<CompanyView[]> {
  const scope = await getPlacementScope(ctx);
  assertPlacementAccess(scope, "operator", "approver", "oversight");
  const institutionId = requireInstitutionId(ctx);

  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const params: unknown[] = [institutionId];
  const clauses: string[] = [];

  if (query.status) {
    params.push(query.status);
    clauses.push(`c.status = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    clauses.push(`c.name ILIKE $${params.length}`);
  }
  params.push(limit);

  const where = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
  const result = await pool.query<CompanyView>(
    `${SELECT_COMPANY}
      WHERE c.institution_id = $1 ${where}
      ORDER BY c.updated_at DESC
      LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

export type UpdateCompanyInput = {
  name?: string;
  website?: string;
  industry?: string;
  location?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  /** Content edit (operator) or status transition. */
  status?: string;
  note?: string;
};

/**
 * Update company content (operator, draft/rejected only) or transition
 * status. Director/Dean may only approve/reject — not edit content.
 */
export async function updateCompany(
  ctx: AuthContext,
  companyId: string,
  input: UpdateCompanyInput
): Promise<CompanyView> {
  const scope = await getPlacementScope(ctx);

  const existing = await pool.query<CompanyRow>(
    `SELECT * FROM public.companies WHERE id = $1`,
    [companyId]
  );
  const row = existing.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Company not found");
  }
  assertPlacementInstitution(scope, row.institution_id);

  const wantsContentEdit =
    input.name !== undefined ||
    input.website !== undefined ||
    input.industry !== undefined ||
    input.location !== undefined ||
    input.contactName !== undefined ||
    input.contactEmail !== undefined ||
    input.contactPhone !== undefined ||
    input.notes !== undefined;
  const wantsStatus = input.status !== undefined;

  if (wantsStatus) {
    if (!isCompanyStatus(input.status)) {
      throw new PlacementValidationError("Invalid company status");
    }
    return transitionCompany(ctx, row, input.status, input.note);
  }

  // Content edit path — operational only (not Director approval power).
  if (scope.access !== "operator") {
    throw new AuthzError(
      "FORBIDDEN",
      "Only placement operators may edit company details"
    );
  }
  if (row.status !== "draft" && row.status !== "rejected") {
    throw new PlacementValidationError(
      "Company details can only be edited while draft or rejected"
    );
  }
  if (!scopeCoversCompany(scope, row)) {
    throw new AuthzError(
      "FORBIDDEN",
      "Your placement responsibility does not cover this company"
    );
  }
  if (!wantsContentEdit) {
    throw new PlacementValidationError("Nothing to update");
  }

  const updated = await pool.query<CompanyRow>(
    `UPDATE public.companies SET
        name = COALESCE($2, name),
        website = COALESCE($3, website),
        industry = COALESCE($4, industry),
        location = COALESCE($5, location),
        contact_name = COALESCE($6, contact_name),
        contact_email = COALESCE($7, contact_email),
        contact_phone = COALESCE($8, contact_phone),
        notes = COALESCE($9, notes)
      WHERE id = $1
      RETURNING *`,
    [
      companyId,
      input.name !== undefined ? requireNonEmpty(input.name, "Company name", 120) : null,
      input.website !== undefined ? optionalText(input.website, "website", 300) || null : null,
      input.industry !== undefined ? optionalText(input.industry, "industry", 120) || null : null,
      input.location !== undefined ? optionalText(input.location, "location", 200) || null : null,
      input.contactName !== undefined ? optionalText(input.contactName, "contactName", 120) || null : null,
      input.contactEmail !== undefined ? optionalText(input.contactEmail, "contactEmail", 200) || null : null,
      input.contactPhone !== undefined ? optionalText(input.contactPhone, "contactPhone", 50) || null : null,
      input.notes !== undefined ? optionalText(input.notes, "notes", 4000) : null,
    ]
  );
  return getCompany(ctx, updated.rows[0].id);
}

async function transitionCompany(
  ctx: AuthContext,
  row: CompanyRow,
  to: import("@/lib/placement-types").CompanyStatus,
  note?: string
): Promise<CompanyView> {
  const scope = await getPlacementScope(ctx);

  if (!canTransitionCompany(row.status, to)) {
    throw new PlacementValidationError(
      `Cannot move company from ${row.status} to ${to}`
    );
  }

  const isApprovalStep = to === "approved" || to === "rejected";
  const isOperatorStep =
    to === "pending_approval" || to === "draft" || to === "archived";

  if (isApprovalStep) {
    assertPlacementApprove(scope);
    const updated = await pool.query<CompanyRow>(
      `UPDATE public.companies SET
          status = $2,
          approved_by = CASE WHEN $2 = 'approved' THEN $3::uuid ELSE approved_by END,
          approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE approved_at END,
          rejected_by = CASE WHEN $2 = 'rejected' THEN $3::uuid ELSE rejected_by END,
          rejected_at = CASE WHEN $2 = 'rejected' THEN now() ELSE rejected_at END,
          approval_note = COALESCE($4, approval_note)
        WHERE id = $1 AND status = $5
        RETURNING *`,
      [row.id, to, ctx.userId, optionalText(note, "note", 1000) || null, row.status]
    );
    if (!updated.rows[0]) {
      throw new PlacementValidationError("Company status already changed");
    }
    return getCompany(ctx, row.id);
  }

  if (!isOperatorStep) {
    throw new AuthzError("FORBIDDEN", "Status change not authorized");
  }
  if (scope.access !== "operator") {
    throw new AuthzError(
      "FORBIDDEN",
      "Only placement operators may move companies through the workflow"
    );
  }
  if (!scopeCoversCompany(scope, row)) {
    throw new AuthzError(
      "FORBIDDEN",
      "Your placement responsibility does not cover this company"
    );
  }

  const updated = await pool.query<CompanyRow>(
    `UPDATE public.companies SET
        status = $2,
        submitted_by = CASE WHEN $2 = 'pending_approval' THEN $3::uuid ELSE submitted_by END,
        submitted_at = CASE WHEN $2 = 'pending_approval' THEN now() ELSE submitted_at END,
        approval_note = COALESCE($4, approval_note)
      WHERE id = $1 AND status = $5
      RETURNING *`,
    [row.id, to, ctx.userId, optionalText(note, "note", 1000) || null, row.status]
  );
  if (!updated.rows[0]) {
    throw new PlacementValidationError("Company status already changed");
  }
  return getCompany(ctx, row.id);
}

/** Companies are institution-wide records — only institution-wide operators. */
function scopeCoversCompany(
  scope: Awaited<ReturnType<typeof getPlacementScope>>,
  row: CompanyRow
): boolean {
  void row;
  if (!scope.canOperate) return false;
  return scope.operateDepartmentIds === null;
}

function assertOperateStrict(
  scope: Awaited<ReturnType<typeof getPlacementScope>>
): void {
  if (scope.access !== "operator" || !scope.canOperate) {
    throw new AuthzError(
      "FORBIDDEN",
      "Placement operations require an active TPO or assigned placement responsibility"
    );
  }
  if (scope.operateDepartmentIds !== null) {
    throw new AuthzError(
      "FORBIDDEN",
      "Company records are institution-wide; only an institution-wide TPO may create them"
    );
  }
}

// Local alias used above (keeps call sites short).
function assertPlacementOperateStrict(
  scope: Awaited<ReturnType<typeof getPlacementScope>>,
  what: string
): void {
  void what;
  assertOperateStrict(scope);
}

function requireInstitutionId(ctx: AuthContext): string {
  if (!ctx.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }
  return ctx.institutionId;
}
