import { pool } from "@/lib/db";
import { AuthzError, ROLES, type AuthContext } from "@/lib/authz";
import {
  assertPlacementAccess,
  assertPlacementInstitution,
  getPlacementScope,
  scopeCovers,
} from "@/lib/placement-scope";
import {
  PlacementValidationError,
  canStudentTransitionApplication,
  canTransitionApplication,
  isApplicationStatus,
  isInterviewMode,
  isInterviewOutcome,
  isInterviewStatus,
  isOfferStatus,
  isPlacementRecordStatus,
  optionalText,
} from "@/lib/placement-types";

/**
 * Application pipeline services (Milestone 9):
 * Application → Screening → Shortlisting → Interview → Selection → Offer
 *             → Joining → Placement record (+ reject/withdraw paths).
 *
 * Security:
 * - Students may only read/update their own application rows (IDOR-safe).
 * - Operators act only inside their placement scope.
 * - Institution isolation on every load.
 * - Status history preserved in placement_application_events.
 */

export type ApplicationRow = {
  id: string;
  institution_id: string;
  opportunity_id: string;
  student_id: string;
  status: import("@/lib/placement-types").ApplicationStatus;
  cover_note: string;
  submitted_at: Date;
  decided_at: Date | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ApplicationView = ApplicationRow & {
  student_name: string;
  student_email: string;
  opportunity_title: string;
  opportunity_kind: string;
  opportunity_status: string;
  company_id: string;
  company_name: string;
  opportunity_deadline: string | null;
  is_own: boolean;
};

export type ApplicationEventView = {
  id: string;
  application_id: string;
  from_status: string | null;
  to_status: string;
  actor_id: string | null;
  actor_name: string | null;
  note: string;
  created_at: Date;
};

export type InterviewView = {
  id: string;
  application_id: string;
  institution_id: string;
  scheduled_at: Date | null;
  mode: string;
  location_or_link: string | null;
  notes: string;
  status: string;
  outcome: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  student_name?: string;
  opportunity_title?: string;
  company_name?: string;
  application_status?: string;
};

export type OfferView = {
  id: string;
  application_id: string;
  institution_id: string;
  offer_status: string;
  offered_on: string | null;
  joining_date: string | null;
  compensation: string | null;
  notes: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  student_name?: string;
  opportunity_title?: string;
  company_name?: string;
  application_status?: string;
};

export type PlacementRecordView = {
  id: string;
  institution_id: string;
  student_id: string;
  opportunity_id: string;
  company_id: string;
  application_id: string;
  joined_on: string | null;
  record_status: string;
  compensation: string | null;
  notes: string;
  recorded_by: string;
  created_at: Date;
  updated_at: Date;
  student_name: string;
  company_name: string;
  opportunity_title: string;
};

async function hydrateApp(
  ctx: AuthContext,
  row: ApplicationRow
): Promise<ApplicationView> {
  const result = await pool.query<ApplicationView>(
    `SELECT a.*,
            p.full_name AS student_name,
            p.email AS student_email,
            o.title AS opportunity_title,
            o.opportunity_kind AS opportunity_kind,
            o.status AS opportunity_status,
            o.application_deadline AS opportunity_deadline,
            o.company_id AS company_id,
            c.name AS company_name
       FROM public.placement_applications a
       JOIN public.profiles p ON p.id = a.student_id
       JOIN public.placement_opportunities o ON o.id = a.opportunity_id
       JOIN public.companies c ON c.id = o.company_id
      WHERE a.id = $1`,
    [row.id]
  );
  const out = result.rows[0];
  if (!out) {
    throw new Error(`Application missing: ${row.id}`);
  }
  return { ...out, is_own: out.student_id === ctx.userId };
}

/**
 * Load an application with strict access rules.
 * Student → own row only. Operator → scope-covered opportunity.
 * Approver/oversight → institution read.
 */
export async function getApplication(
  ctx: AuthContext,
  applicationId: string
): Promise<ApplicationView> {
  const scope = await getPlacementScope(ctx);
  assertPlacementAccess(scope, "student", "operator", "approver", "oversight");

  const result = await pool.query<ApplicationRow>(
    `SELECT * FROM public.placement_applications WHERE id = $1`,
    [applicationId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Application not found");
  }
  assertPlacementInstitution(scope, row.institution_id);

  if (scope.access === "student") {
    if (row.student_id !== ctx.userId) {
      // Prevent IDOR / existence probing across students.
      throw new AuthzError("FORBIDDEN", "Application not found");
    }
    return hydrateApp(ctx, row);
  }

  if (scope.access === "operator") {
    const opp = await pool.query<{
      department_id: string | null;
      created_by: string;
    }>(
      `SELECT department_id, created_by FROM public.placement_opportunities WHERE id = $1`,
      [row.opportunity_id]
    );
    const opportunity = opp.rows[0];
    if (!opportunity || !scopeCovers(scope, opportunity)) {
      throw new AuthzError(
        "FORBIDDEN",
        "This application is outside your placement scope"
      );
    }
    return hydrateApp(ctx, row);
  }

  return hydrateApp(ctx, row);
}

export type ListApplicationsQuery = {
  status?: string;
  opportunityId?: string;
  studentId?: string;
  /** Student mode forces own rows. */
  mine?: boolean;
  limit?: number;
};

export async function listApplications(
  ctx: AuthContext,
  query: ListApplicationsQuery = {}
): Promise<ApplicationView[]> {
  const scope = await getPlacementScope(ctx);
  assertPlacementAccess(scope, "student", "operator", "approver", "oversight");
  const institutionId = ctx.institutionId;
  if (!institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }

  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const params: unknown[] = [institutionId];
  const clauses: string[] = [];

  if (scope.access === "student" || query.mine) {
    params.push(ctx.userId);
    clauses.push(`a.student_id = $${params.length}`);
  } else if (scope.access === "operator") {
    // Scope: opportunities the operator covers.
    if (scope.operateDepartmentIds === null) {
      // Institution-wide operator sees all in institution (clause below).
    } else {
      params.push(scope.operateDepartmentIds);
      clauses.push(`(
        o.department_id = ANY($${params.length}::uuid[])
        OR o.created_by = $${params.length + 1}
      )`);
      params.push(ctx.userId);
    }
  }

  if (query.status) {
    params.push(query.status);
    clauses.push(`a.status = $${params.length}`);
  }
  if (query.opportunityId) {
    params.push(query.opportunityId);
    clauses.push(`a.opportunity_id = $${params.length}`);
  }
  if (query.studentId) {
    params.push(query.studentId);
    clauses.push(`a.student_id = $${params.length}`);
    // Non-students must still be authorized for the student (see below).
    if (scope.access === "student" && query.studentId !== ctx.userId) {
      return [];
    }
  }

  params.push(limit);
  const where = clauses.length ? `AND ${clauses.join(" AND ")}` : "";

  const result = await pool.query<ApplicationRow & { department_id: string | null; created_by: string }>(
    `SELECT a.*, o.department_id, o.created_by
       FROM public.placement_applications a
       JOIN public.placement_opportunities o ON o.id = a.opportunity_id
      WHERE a.institution_id = $1 ${where}
      ORDER BY a.updated_at DESC
      LIMIT $${params.length}`,
    params
  );

  const rows = result.rows.filter((row) => {
    if (scope.access === "student") return row.student_id === ctx.userId;
    if (scope.access === "operator" && scope.operateDepartmentIds !== null) {
      return (
        (row.department_id &&
          scope.operateDepartmentIds.includes(row.department_id)) ||
        row.created_by === ctx.userId
      );
    }
    return true;
  });

  return Promise.all(rows.map((r) => hydrateApp(ctx, r)));
}

export async function listApplicationEvents(
  ctx: AuthContext,
  applicationId: string
): Promise<ApplicationEventView[]> {
  const app = await getApplication(ctx, applicationId);
  const result = await pool.query<ApplicationEventView>(
    `SELECT e.*, p.full_name AS actor_name
       FROM public.placement_application_events e
       LEFT JOIN public.profiles p ON p.id = e.actor_id
      WHERE e.application_id = $1
      ORDER BY e.created_at DESC`,
    [app.id]
  );
  return result.rows;
}

async function loadEnrollmentForStudent(studentId: string) {
  const result = await pool.query<{
    program_id: string;
    section_id: string;
    semester_number: number;
    department_id: string;
    institution_id: string;
    status: string;
  }>(
    `SELECT e.program_id, e.section_id, sm.semester_number,
            pr.department_id, e.institution_id, e.status
       FROM public.student_enrollments e
       JOIN public.programs pr ON pr.id = e.program_id
       JOIN public.semesters sm ON sm.id = e.semester_id
      WHERE e.student_id = $1 AND e.status = 'active'
      LIMIT 1`,
    [studentId]
  );
  return result.rows[0] ?? null;
}

async function studentEligibleForOpportunity(
  studentId: string,
  opportunityId: string
): Promise<{ eligible: boolean; hasEnrollment: boolean }> {
  const enr = await loadEnrollmentForStudent(studentId);
  if (!enr) return { eligible: false, hasEnrollment: false };

  const opp = await pool.query<{
    status: string;
    application_deadline: string | null;
    institution_id: string;
  }>(
    `SELECT status, application_deadline, institution_id
       FROM public.placement_opportunities WHERE id = $1`,
    [opportunityId]
  );
  const opportunity = opp.rows[0];
  if (!opportunity) return { eligible: false, hasEnrollment: true };
  if (opportunity.status !== "open") {
    return { eligible: false, hasEnrollment: true };
  }
  if (
    opportunity.application_deadline &&
    opportunity.application_deadline < new Date().toISOString().slice(0, 10)
  ) {
    return { eligible: false, hasEnrollment: true };
  }
  if (opportunity.institution_id !== enr.institution_id) {
    return { eligible: false, hasEnrollment: true };
  }

  const check = await pool.query<{ ok: boolean }>(
    `SELECT true AS ok
       WHERE NOT EXISTS (
         SELECT 1 FROM public.placement_opportunity_eligibility e
          WHERE e.opportunity_id = $1
       )
       OR EXISTS (
         SELECT 1 FROM public.placement_opportunity_eligibility e
          WHERE e.opportunity_id = $1
            AND (e.program_id IS NULL OR e.program_id = $2)
            AND (e.department_id IS NULL OR e.department_id = $3)
            AND (e.section_id IS NULL OR e.section_id = $4)
            AND (e.semester_from IS NULL OR e.semester_from <= $5)
            AND (e.semester_to IS NULL OR e.semester_to >= $5)
       )`,
    [opportunityId, enr.program_id, enr.department_id, enr.section_id, enr.semester_number]
  );
  return { eligible: Boolean(check.rows[0]?.ok), hasEnrollment: true };
}

/** Student applies to an open opportunity (server-side re-check). */
export async function createApplication(
  ctx: AuthContext,
  params: { opportunityId: string; coverNote?: string }
): Promise<ApplicationView> {
  if (ctx.roleName !== ROLES.student) {
    throw new AuthzError("FORBIDDEN", "Student role required to apply");
  }
  if (!ctx.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }

  const check = await studentEligibleForOpportunity(
    ctx.userId,
    params.opportunityId
  );
  if (!check.hasEnrollment) {
    throw new PlacementValidationError(
      "You need an active enrollment to apply for placements"
    );
  }
  if (!check.eligible) {
    throw new AuthzError(
      "FORBIDDEN",
      "You are not eligible for this opportunity or applications are closed"
    );
  }

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM public.placement_applications
      WHERE opportunity_id = $1 AND student_id = $2`,
    [params.opportunityId, ctx.userId]
  );
  if (existing.rows[0]) {
    throw new PlacementValidationError("You have already applied to this opportunity");
  }

  const inserted = await pool.query<ApplicationRow>(
    `INSERT INTO public.placement_applications (
        institution_id, opportunity_id, student_id, status, cover_note, updated_by
     )
     SELECT o.institution_id, o.id, $2, 'submitted', $3, $2
       FROM public.placement_opportunities o
      WHERE o.id = $1
     RETURNING *`,
    [params.opportunityId, ctx.userId, optionalText(params.coverNote, "coverNote", 2000)]
  );
  const row = inserted.rows[0];
  if (!row) {
    throw new PlacementValidationError("Opportunity not found");
  }

  await pool.query(
    `INSERT INTO public.placement_application_events (
        application_id, institution_id, from_status, to_status, actor_id, note
     ) VALUES ($1, $2, NULL, 'submitted', $3, 'Application submitted')`,
    [row.id, row.institution_id, ctx.userId]
  );

  return hydrateApp(ctx, row);
}

/** Transition an application through the pipeline (with history). */
export async function transitionApplication(
  ctx: AuthContext,
  applicationId: string,
  to: string,
  note?: string
): Promise<ApplicationView> {
  const scope = await getPlacementScope(ctx);
  const app = await getApplication(ctx, applicationId); // enforces access
  if (!isApplicationStatus(to)) {
    throw new PlacementValidationError("Invalid application status");
  }
  if (!canTransitionApplication(app.status, to)) {
    throw new PlacementValidationError(
      `Cannot move application from ${app.status} to ${to}`
    );
  }

  const cleanNote = optionalText(note, "note", 1000);

  if (scope.access === "student") {
    if (app.student_id !== ctx.userId) {
      throw new AuthzError("FORBIDDEN", "Application not found");
    }
    if (!canStudentTransitionApplication(app.status, to)) {
      throw new AuthzError(
        "FORBIDDEN",
        "You can only withdraw your own application (or decline your own offer)"
      );
    }
  } else if (scope.access === "operator") {
    if (app.student_id === ctx.userId) {
      throw new AuthzError(
        "FORBIDDEN",
        "Operators may not process their own placement application"
      );
    }
  } else {
    throw new AuthzError(
      "FORBIDDEN",
      "Approver and oversight roles are read-only for application processing"
    );
  }

  const terminal = ["joined", "offer_declined", "rejected", "withdrawn"];
  const updated = await pool.query<ApplicationRow>(
    `UPDATE public.placement_applications SET
        status = $2,
        updated_by = $3,
        decided_at = CASE WHEN $2 = ANY($4::text[]) THEN now() ELSE decided_at END
      WHERE id = $1 AND status = $5
      RETURNING *`,
    [applicationId, to, ctx.userId, terminal, app.status]
  );
  const row = updated.rows[0];
  if (!row) {
    throw new PlacementValidationError("Application status already changed");
  }

  await pool.query(
    `INSERT INTO public.placement_application_events (
        application_id, institution_id, from_status, to_status, actor_id, note
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.id, row.institution_id, app.status, to, ctx.userId, cleanNote]
  );

  return hydrateApp(ctx, row);
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

export async function createInterview(
  ctx: AuthContext,
  params: {
    applicationId: string;
    scheduledAt?: string | null;
    mode?: string;
    locationOrLink?: string;
    notes?: string;
  }
): Promise<InterviewView> {
  const scope = await getPlacementScope(ctx);
  if (scope.access !== "operator") {
    throw new AuthzError("FORBIDDEN", "Only placement operators schedule interviews");
  }
  const app = await getApplication(ctx, params.applicationId);
  if (!["shortlisted", "interview", "screening", "selected"].includes(app.status)) {
    throw new PlacementValidationError(
      "Interviews can be scheduled for screening, shortlisted, interview, or selected applications"
    );
  }
  const mode = params.mode ?? "online";
  if (!isInterviewMode(mode)) {
    throw new PlacementValidationError("Invalid interview mode");
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO public.placement_interviews (
        application_id, institution_id, scheduled_at, mode,
        location_or_link, notes, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      app.id,
      app.institution_id,
      params.scheduledAt || null,
      mode,
      optionalText(params.locationOrLink, "locationOrLink", 500) || null,
      optionalText(params.notes, "notes", 2000),
      ctx.userId,
    ]
  );

  // Move pipeline to interview stage when scheduling from earlier stages.
  if (app.status !== "interview") {
    await transitionApplication(ctx, app.id, "interview", "Interview scheduled");
  }

  const view = await pool.query<InterviewView>(
    `SELECT * FROM public.placement_interviews WHERE id = $1`,
    [inserted.rows[0].id]
  );
  return view.rows[0];
}

export async function updateInterview(
  ctx: AuthContext,
  interviewId: string,
  input: {
    status?: string;
    outcome?: string | null;
    scheduledAt?: string | null;
    notes?: string;
  }
): Promise<InterviewView> {
  const scope = await getPlacementScope(ctx);
  if (scope.access !== "operator") {
    throw new AuthzError("FORBIDDEN", "Only placement operators update interviews");
  }
  const existing = await pool.query<{
    id: string;
    institution_id: string;
    application_id: string;
  }>(
    `SELECT id, institution_id, application_id FROM public.placement_interviews WHERE id = $1`,
    [interviewId]
  );
  const row = existing.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Interview not found");
  }
  assertPlacementInstitution(scope, row.institution_id);
  await getApplication(ctx, row.application_id); // scope re-check

  if (input.status !== undefined && !isInterviewStatus(input.status)) {
    throw new PlacementValidationError("Invalid interview status");
  }
  if (input.outcome !== undefined && input.outcome !== null && !isInterviewOutcome(input.outcome)) {
    throw new PlacementValidationError("Invalid interview outcome");
  }

  await pool.query(
    `UPDATE public.placement_interviews SET
        status = COALESCE($2, status),
        outcome = CASE WHEN $3::boolean THEN $4 ELSE outcome END,
        scheduled_at = CASE WHEN $5::boolean THEN $6::timestamptz ELSE scheduled_at END,
        notes = COALESCE($7, notes)
      WHERE id = $1`,
    [
      interviewId,
      input.status ?? null,
      input.outcome !== undefined,
      input.outcome ?? null,
      input.scheduledAt !== undefined,
      input.scheduledAt || null,
      input.notes !== undefined ? optionalText(input.notes, "notes", 2000) : null,
    ]
  );

  const view = await pool.query<InterviewView>(
    `SELECT * FROM public.placement_interviews WHERE id = $1`,
    [interviewId]
  );
  return view.rows[0];
}

export async function listInterviews(
  ctx: AuthContext,
  query: { mine?: boolean; status?: string; limit?: number } = {}
): Promise<InterviewView[]> {
  const scope = await getPlacementScope(ctx);
  assertPlacementAccess(scope, "student", "operator", "approver", "oversight");
  const institutionId = ctx.institutionId;
  if (!institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }

  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const params: unknown[] = [institutionId];
  const clauses: string[] = [];

  if (scope.access === "student" || query.mine) {
    params.push(ctx.userId);
    clauses.push(`a.student_id = $${params.length}`);
  }
  if (query.status) {
    params.push(query.status);
    clauses.push(`i.status = $${params.length}`);
  }
  params.push(limit);
  const where = clauses.length ? `AND ${clauses.join(" AND ")}` : "";

  const result = await pool.query<
    InterviewView & { department_id: string | null; opp_created_by: string }
  >(
    `SELECT i.*,
            p.full_name AS student_name,
            o.title AS opportunity_title,
            c.name AS company_name,
            a.status AS application_status,
            o.department_id,
            o.created_by AS opp_created_by
       FROM public.placement_interviews i
       JOIN public.placement_applications a ON a.id = i.application_id
       JOIN public.profiles p ON p.id = a.student_id
       JOIN public.placement_opportunities o ON o.id = a.opportunity_id
       JOIN public.companies c ON c.id = o.company_id
      WHERE i.institution_id = $1 ${where}
      ORDER BY i.scheduled_at DESC NULLS LAST, i.created_at DESC
      LIMIT $${params.length}`,
    params
  );

  if (scope.access === "student") {
    return result.rows.filter((row) => {
      void row;
      return true; // student_id filter already applied in SQL
    });
  }
  if (scope.access === "operator" && scope.operateDepartmentIds !== null) {
    const deptIds = scope.operateDepartmentIds;
    return result.rows.filter(
      (row) =>
        (row.department_id && deptIds.includes(row.department_id)) ||
        row.opp_created_by === ctx.userId
    );
  }
  return result.rows;
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export async function createOffer(
  ctx: AuthContext,
  params: {
    applicationId: string;
    offeredOn?: string | null;
    joiningDate?: string | null;
    compensation?: string;
    notes?: string;
  }
): Promise<OfferView> {
  const scope = await getPlacementScope(ctx);
  if (scope.access !== "operator") {
    throw new AuthzError("FORBIDDEN", "Only placement operators create offers");
  }
  const app = await getApplication(ctx, params.applicationId);
  if (!["selected", "offered"].includes(app.status)) {
    throw new PlacementValidationError(
      "Offers can only be created for selected (or already offered) applications"
    );
  }
  if (app.student_id === ctx.userId) {
    throw new AuthzError(
      "FORBIDDEN",
      "Operators may not create offers on their own application"
    );
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO public.placement_offers (
        application_id, institution_id, offered_on, joining_date,
        compensation, notes, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      app.id,
      app.institution_id,
      params.offeredOn || null,
      params.joiningDate || null,
      optionalText(params.compensation, "compensation", 300) || null,
      optionalText(params.notes, "notes", 2000),
      ctx.userId,
    ]
  );

  if (app.status === "selected") {
    await transitionApplication(ctx, app.id, "offered", "Offer created");
  }

  const view = await pool.query<OfferView>(
    `SELECT * FROM public.placement_offers WHERE id = $1`,
    [inserted.rows[0].id]
  );
  return view.rows[0];
}

export async function updateOffer(
  ctx: AuthContext,
  offerId: string,
  input: { offerStatus?: string; joiningDate?: string | null; notes?: string }
): Promise<OfferView> {
  const scope = await getPlacementScope(ctx);
  const existing = await pool.query<{
    id: string;
    institution_id: string;
    application_id: string;
    offer_status: string;
  }>(
    `SELECT id, institution_id, application_id, offer_status
       FROM public.placement_offers WHERE id = $1`,
    [offerId]
  );
  const row = existing.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Offer not found");
  }
  assertPlacementInstitution(scope, row.institution_id);
  const app = await getApplication(ctx, row.application_id);

  if (input.offerStatus !== undefined) {
    if (!isOfferStatus(input.offerStatus)) {
      throw new PlacementValidationError("Invalid offer status");
    }
    const isStudentAction =
      scope.access === "student" && app.student_id === ctx.userId;
    const isOperatorAction = scope.access === "operator";
    if (!isStudentAction && !isOperatorAction) {
      throw new AuthzError("FORBIDDEN", "Not authorized to update this offer");
    }
    // Students may only accept/decline their own pending offer.
    if (isStudentAction) {
      if (row.offer_status !== "pending" || !["accepted", "declined"].includes(input.offerStatus)) {
        throw new AuthzError(
          "FORBIDDEN",
          "You can only accept or decline your own pending offer"
        );
      }
    }
    // Operators must not process offers on their own application.
    if (isOperatorAction && app.student_id === ctx.userId) {
      throw new AuthzError(
        "FORBIDDEN",
        "Operators may not update offers on their own application"
      );
    }
    await pool.query(
      `UPDATE public.placement_offers SET offer_status = $2 WHERE id = $1`,
      [offerId, input.offerStatus]
    );
    if (input.offerStatus === "declined") {
      await transitionApplication(ctx, app.id, "offer_declined", "Offer declined");
    } else if (input.offerStatus === "accepted" && app.status === "offered") {
      // Acceptance alone does not mark joined — joining creates the record.
    }
  } else if (scope.access === "operator") {
    if (app.student_id === ctx.userId) {
      throw new AuthzError(
        "FORBIDDEN",
        "Operators may not update offers on their own application"
      );
    }
    await pool.query(
      `UPDATE public.placement_offers SET
          joining_date = CASE WHEN $2::boolean THEN $3::date ELSE joining_date END,
          notes = COALESCE($4, notes)
        WHERE id = $1`,
      [
        offerId,
        input.joiningDate !== undefined,
        input.joiningDate || null,
        input.notes !== undefined ? optionalText(input.notes, "notes", 2000) : null,
      ]
    );
  } else {
    throw new AuthzError("FORBIDDEN", "Not authorized to update this offer");
  }

  const view = await pool.query<OfferView>(
    `SELECT * FROM public.placement_offers WHERE id = $1`,
    [offerId]
  );
  return view.rows[0];
}

export async function listOffers(
  ctx: AuthContext,
  query: { mine?: boolean; offerStatus?: string; limit?: number } = {}
): Promise<OfferView[]> {
  const scope = await getPlacementScope(ctx);
  assertPlacementAccess(scope, "student", "operator", "approver", "oversight");
  const institutionId = ctx.institutionId;
  if (!institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }

  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const params: unknown[] = [institutionId];
  const clauses: string[] = [];

  if (scope.access === "student" || query.mine) {
    params.push(ctx.userId);
    clauses.push(`a.student_id = $${params.length}`);
  }
  if (query.offerStatus) {
    params.push(query.offerStatus);
    clauses.push(`of.offer_status = $${params.length}`);
  }
  params.push(limit);
  const where = clauses.length ? `AND ${clauses.join(" AND ")}` : "";

  const result = await pool.query<
    OfferView & { department_id: string | null; opp_created_by: string }
  >(
    `SELECT of.*,
            p.full_name AS student_name,
            o.title AS opportunity_title,
            c.name AS company_name,
            a.status AS application_status,
            o.department_id,
            o.created_by AS opp_created_by
       FROM public.placement_offers of
       JOIN public.placement_applications a ON a.id = of.application_id
       JOIN public.profiles p ON p.id = a.student_id
       JOIN public.placement_opportunities o ON o.id = a.opportunity_id
       JOIN public.companies c ON c.id = o.company_id
      WHERE of.institution_id = $1 ${where}
      ORDER BY of.created_at DESC
      LIMIT $${params.length}`,
    params
  );
  if (scope.access === "operator" && scope.operateDepartmentIds !== null) {
    const deptIds = scope.operateDepartmentIds;
    return result.rows.filter(
      (row) =>
        (row.department_id && deptIds.includes(row.department_id)) ||
        row.opp_created_by === ctx.userId
    );
  }
  return result.rows;
}

// ---------------------------------------------------------------------------
// Placement records
// ---------------------------------------------------------------------------

export async function createPlacementRecord(
  ctx: AuthContext,
  params: {
    applicationId: string;
    joinedOn?: string | null;
    recordStatus?: string;
    compensation?: string;
    notes?: string;
  }
): Promise<PlacementRecordView> {
  const scope = await getPlacementScope(ctx);
  if (scope.access !== "operator") {
    throw new AuthzError(
      "FORBIDDEN",
      "Only placement operators record placements"
    );
  }
  const app = await getApplication(ctx, params.applicationId);
  if (!["offered", "joined"].includes(app.status)) {
    throw new PlacementValidationError(
      "A placement record requires an offered (or joined) application"
    );
  }
  const recordStatus = params.recordStatus ?? "joined";
  if (!isPlacementRecordStatus(recordStatus)) {
    throw new PlacementValidationError("Invalid placement record status");
  }

  const opp = await pool.query<{
    company_id: string;
    compensation: string | null;
  }>(
    `SELECT company_id, compensation FROM public.placement_opportunities WHERE id = $1`,
    [app.opportunity_id]
  );
  const opportunity = opp.rows[0];
  if (!opportunity) {
    throw new PlacementValidationError("Opportunity not found");
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO public.placement_records (
        institution_id, student_id, opportunity_id, company_id,
        application_id, joined_on, record_status, compensation, notes, recorded_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (application_id) DO NOTHING
     RETURNING id`,
    [
      app.institution_id,
      app.student_id,
      app.opportunity_id,
      opportunity.company_id,
      app.id,
      params.joinedOn || null,
      recordStatus,
      optionalText(params.compensation, "compensation", 300) || opportunity.compensation,
      optionalText(params.notes, "notes", 2000),
      ctx.userId,
    ]
  );

  if (!inserted.rows[0]) {
    throw new PlacementValidationError(
      "A placement record already exists for this application"
    );
  }

  if (recordStatus === "joined" && app.status !== "joined") {
    await transitionApplication(ctx, app.id, "joined", "Joined — placement recorded");
  } else if (recordStatus === "offer_declined" && app.status !== "offer_declined") {
    await transitionApplication(ctx, app.id, "offer_declined", "Offer declined — recorded");
  }

  const view = await pool.query<PlacementRecordView>(
    `SELECT r.*,
            p.full_name AS student_name,
            c.name AS company_name,
            o.title AS opportunity_title
       FROM public.placement_records r
       JOIN public.profiles p ON p.id = r.student_id
       JOIN public.companies c ON c.id = r.company_id
       JOIN public.placement_opportunities o ON o.id = r.opportunity_id
      WHERE r.id = $1`,
    [inserted.rows[0].id]
  );
  return view.rows[0];
}

export async function listPlacementRecords(
  ctx: AuthContext,
  query: { mine?: boolean; limit?: number } = {}
): Promise<PlacementRecordView[]> {
  const scope = await getPlacementScope(ctx);
  assertPlacementAccess(scope, "student", "operator", "approver", "oversight");
  const institutionId = ctx.institutionId;
  if (!institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }

  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const params: unknown[] = [institutionId];
  const clauses: string[] = [];

  if (scope.access === "student" || query.mine) {
    params.push(ctx.userId);
    clauses.push(`r.student_id = $${params.length}`);
  }
  params.push(limit);
  const where = clauses.length ? `AND ${clauses.join(" AND ")}` : "";

  const result = await pool.query<
    PlacementRecordView & { department_id: string | null; opp_created_by: string }
  >(
    `SELECT r.*,
            p.full_name AS student_name,
            c.name AS company_name,
            o.title AS opportunity_title,
            o.department_id,
            o.created_by AS opp_created_by
       FROM public.placement_records r
       JOIN public.profiles p ON p.id = r.student_id
       JOIN public.companies c ON c.id = r.company_id
       JOIN public.placement_opportunities o ON o.id = r.opportunity_id
      WHERE r.institution_id = $1 ${where}
      ORDER BY r.created_at DESC
      LIMIT $${params.length}`,
    params
  );
  if (scope.access === "operator" && scope.operateDepartmentIds !== null) {
    const deptIds = scope.operateDepartmentIds;
    return result.rows.filter(
      (row) =>
        (row.department_id && deptIds.includes(row.department_id)) ||
        row.opp_created_by === ctx.userId
    );
  }
  return result.rows;
}

/** Real-data placement summary counts (no fabricated statistics). */
export async function loadPlacementCounts(
  ctx: AuthContext
): Promise<Record<string, number>> {
  const scope = await getPlacementScope(ctx);
  if (!ctx.institutionId || scope.access === "denied") {
    return {};
  }
  const institutionId = ctx.institutionId;
  const empty = {
    companies: 0,
    openOpportunities: 0,
    applications: 0,
    shortlisted: 0,
    interviews: 0,
    pendingOffers: 0,
    placements: 0,
    activeResponsibilities: 0,
    pendingAppointments: 0,
    pendingOpportunities: 0,
    pendingCompanies: 0,
  };

  if (scope.access === "student") {
    const r = await pool.query<Record<string, string>>(
      `SELECT
         (SELECT count(*) FROM public.placement_opportunities
           WHERE institution_id = $1 AND status = 'open')::text AS open_opportunities,
         (SELECT count(*) FROM public.placement_applications
           WHERE student_id = $2)::text AS applications,
         (SELECT count(*) FROM public.placement_applications
           WHERE student_id = $2 AND status = 'shortlisted')::text AS shortlisted,
         (SELECT count(*) FROM public.placement_interviews i
           JOIN public.placement_applications a ON a.id = i.application_id
           WHERE a.student_id = $2 AND i.status = 'scheduled')::text AS interviews,
         (SELECT count(*) FROM public.placement_offers of
           JOIN public.placement_applications a ON a.id = of.application_id
           WHERE a.student_id = $2 AND of.offer_status = 'pending')::text AS pending_offers,
         (SELECT count(*) FROM public.placement_records
           WHERE student_id = $2)::text AS placements`,
      [institutionId, ctx.userId]
    );
    const row = r.rows[0] ?? {};
    return {
      ...empty,
      openOpportunities: Number(row.open_opportunities ?? 0),
      applications: Number(row.applications ?? 0),
      shortlisted: Number(row.shortlisted ?? 0),
      interviews: Number(row.interviews ?? 0),
      pendingOffers: Number(row.pending_offers ?? 0),
      placements: Number(row.placements ?? 0),
    };
  }

  const result = await pool.query<Record<string, string>>(
    `SELECT
       (SELECT count(*) FROM public.companies
         WHERE institution_id = $1)::text AS companies,
       (SELECT count(*) FROM public.placement_opportunities
         WHERE institution_id = $1 AND status = 'open')::text AS open_opportunities,
       (SELECT count(*) FROM public.placement_applications
         WHERE institution_id = $1)::text AS applications,
       (SELECT count(*) FROM public.placement_applications
         WHERE institution_id = $1 AND status = 'shortlisted')::text AS shortlisted,
       (SELECT count(*) FROM public.placement_interviews
         WHERE institution_id = $1 AND status = 'scheduled')::text AS interviews,
       (SELECT count(*) FROM public.placement_offers
         WHERE institution_id = $1 AND offer_status = 'pending')::text AS pending_offers,
       (SELECT count(*) FROM public.placement_responsibilities
         WHERE institution_id = $1 AND status = 'active')::text AS active_responsibilities,
       (SELECT count(*) FROM public.placement_responsibilities
         WHERE institution_id = $1 AND status = 'pending')::text AS pending_appointments,
       (SELECT count(*) FROM public.placement_opportunities
         WHERE institution_id = $1 AND status = 'pending_approval')::text AS pending_opportunities,
       (SELECT count(*) FROM public.companies
         WHERE institution_id = $1 AND status = 'pending_approval')::text AS pending_companies,
       (SELECT count(*) FROM public.placement_records
         WHERE institution_id = $1)::text AS placements`,
    [institutionId]
  );
  const row = result.rows[0] ?? {};
  return {
    companies: Number(row.companies ?? 0),
    openOpportunities: Number(row.open_opportunities ?? 0),
    applications: Number(row.applications ?? 0),
    shortlisted: Number(row.shortlisted ?? 0),
    interviews: Number(row.interviews ?? 0),
    pendingOffers: Number(row.pending_offers ?? 0),
    placements: Number(row.placements ?? 0),
    activeResponsibilities: Number(row.active_responsibilities ?? 0),
    pendingAppointments: Number(row.pending_appointments ?? 0),
    pendingOpportunities: Number(row.pending_opportunities ?? 0),
    pendingCompanies: Number(row.pending_companies ?? 0),
  };
}
