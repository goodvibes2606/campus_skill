import { pool } from "@/lib/db";
import {
  AuthzError,
  type AuthContext,
} from "@/lib/authz";
import {
  assertPlacementApprove,
  assertPlacementAccess,
  assertPlacementInstitution,
  getPlacementScope,
  type PlacementScope,
} from "@/lib/placement-scope";
import {
  PlacementValidationError,
  isPlacementResponsibility,
  optionalText,
} from "@/lib/placement-types";

/**
 * TPO / placement faculty appointment services (Milestone 9).
 *
 * History-preserving: a new appointment never overwrites a previous one.
 * Flow: create (pending) → Director/Dean approves (active, previous active
 * TPO row is ended) | rejected. End/handover closes the active row.
 */

export type PlacementResponsibilityRow = {
  id: string;
  institution_id: string;
  person_id: string;
  responsibility: "tpo" | "placement_faculty";
  responsibility_title: string;
  department_id: string | null;
  program_id: string | null;
  scope_notes: string;
  requested_by: string | null;
  appointed_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  decision_note: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: "pending" | "active" | "ended" | "rejected";
  created_at: Date;
  updated_at: Date;
};

export type PlacementResponsibilityView = PlacementResponsibilityRow & {
  person_name: string;
  person_email: string;
  person_role: string;
  approver_name: string | null;
  appointer_name: string | null;
  department_name: string | null;
  department_code: string | null;
  program_name: string | null;
};

const SELECT_RESP = `
  SELECT r.*,
         p.full_name AS person_name,
         p.email AS person_email,
         ro.name AS person_role,
         ap.full_name AS approver_name,
         at.full_name AS appointer_name,
         d.name AS department_name,
         d.code AS department_code,
         pr.name AS program_name
    FROM public.placement_responsibilities r
    JOIN public.profiles p ON p.id = r.person_id
    JOIN public.roles ro ON ro.id = p.role_id
    LEFT JOIN public.profiles ap ON ap.id = r.approved_by
    LEFT JOIN public.profiles at ON at.id = r.appointed_by
    LEFT JOIN public.departments d ON d.id = r.department_id
    LEFT JOIN public.programs pr ON pr.id = r.program_id
`;

async function hydrate(
  row: PlacementResponsibilityRow
): Promise<PlacementResponsibilityView> {
  const result = await pool.query<PlacementResponsibilityView>(
    `${SELECT_RESP} WHERE r.id = $1`,
    [row.id]
  );
  const out = result.rows[0];
  if (!out) {
    throw new Error(`Placement responsibility missing: ${row.id}`);
  }
  return out;
}

/**
 * Create a pending appointment request.
 * Allowed: Director/Dean or institution admin (request/founder step).
 * Approval remains exclusively Director/Dean.
 */
export async function createPlacementResponsibility(
  ctx: AuthContext,
  params: {
    personId: string;
    responsibility: string;
    responsibilityTitle?: string;
    departmentId?: string | null;
    programId?: string | null;
    scopeNotes?: string;
    startsOn?: string | null;
  }
): Promise<PlacementResponsibilityView> {
  const scope = await getPlacementScope(ctx);
  if (!scope.canCreateAppointments) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only Director/Dean or institution admin may request placement appointments"
    );
  }
  const institutionId = ctx.institutionId;
  if (!institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }

  if (!isPlacementResponsibility(params.responsibility)) {
    throw new PlacementValidationError(
      "responsibility must be 'tpo' or 'placement_faculty'"
    );
  }

  const person = await pool.query<{
    id: string;
    institution_id: string | null;
    role_name: string;
    status: string;
  }>(
    `SELECT p.id, p.institution_id, r.name AS role_name, p.status
       FROM public.profiles p
       JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = $1`,
    [params.personId]
  );
  const personRow = person.rows[0];
  if (!personRow || personRow.status !== "active") {
    throw new AuthzError("FORBIDDEN", "Target profile not found or inactive");
  }
  if (!personRow.institution_id) {
    throw new AuthzError("NO_INSTITUTION", "Target profile has no institution");
  }
  assertPlacementInstitution(scope, personRow.institution_id);
  if (personRow.institution_id !== institutionId) {
    throw new AuthzError(
      "FORBIDDEN",
      "Person and institution do not match"
    );
  }

  // Director/Dean may not appoint themselves as TPO (self-deal guard).
  if (
    params.responsibility === "tpo" &&
    ctx.roleName === "director_dean" &&
    params.personId === ctx.userId
  ) {
    throw new AuthzError(
      "FORBIDDEN",
      "You cannot create a TPO appointment for yourself"
    );
  }

  if (params.responsibility === "tpo") {
    if (!["faculty", "hod", "tpo", "director_dean"].includes(personRow.role_name)) {
      throw new AuthzError(
        "FORBIDDEN",
        "TPO appointment requires a faculty, HOD, TPO, or Director profile"
      );
    }
  } else if (!["faculty", "hod"].includes(personRow.role_name)) {
    throw new AuthzError(
      "FORBIDDEN",
      "Placement faculty assignment requires a faculty or HOD profile"
    );
  }

  if (params.departmentId) {
    const dept = await pool.query<{ institution_id: string }>(
      `SELECT institution_id FROM public.departments WHERE id = $1`,
      [params.departmentId]
    );
    if (!dept.rows[0]) {
      throw new PlacementValidationError("Department not found");
    }
    assertPlacementInstitution(scope, dept.rows[0].institution_id);
  }

  if (params.programId) {
    const prog = await pool.query<{ institution_id: string }>(
      `SELECT institution_id FROM public.programs WHERE id = $1`,
      [params.programId]
    );
    if (!prog.rows[0]) {
      throw new PlacementValidationError("Program not found");
    }
    assertPlacementInstitution(scope, prog.rows[0].institution_id);
  }

  // Reject duplicate active-equivalent pending requests.
  const dup = await pool.query<{ id: string }>(
    `SELECT id FROM public.placement_responsibilities
      WHERE institution_id = $1
        AND person_id = $2
        AND responsibility = $3
        AND status = 'pending'
        AND COALESCE(department_id, '00000000-0000-0000-0000-000000000000')
            = COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000')`,
    [institutionId, params.personId, params.responsibility, params.departmentId ?? null]
  );
  if (dup.rows[0]) {
    throw new PlacementValidationError(
      "A pending appointment request already exists for this person and scope"
    );
  }

  const inserted = await pool.query<PlacementResponsibilityRow>(
    `INSERT INTO public.placement_responsibilities (
        institution_id, person_id, responsibility, responsibility_title,
        department_id, program_id, scope_notes,
        requested_by, appointed_by, starts_on, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,'pending')
     RETURNING *`,
    [
      institutionId,
      params.personId,
      params.responsibility,
      optionalText(params.responsibilityTitle, "responsibilityTitle", 160) ||
        (params.responsibility === "tpo"
          ? "Training & Placement Officer"
          : "Placement Faculty"),
      params.departmentId ?? null,
      params.programId ?? null,
      optionalText(params.scopeNotes, "scopeNotes", 1000),
      ctx.userId,
      params.startsOn ?? null,
    ]
  );

  return hydrate(inserted.rows[0]);
}

/**
 * Director/Dean approval decision on a pending appointment.
 * Approve → active (previous active TPO row is ENDED — history preserved).
 * Reject → rejected.
 */
export async function decidePlacementResponsibility(
  ctx: AuthContext,
  id: string,
  decision: "approve" | "reject",
  note?: string
): Promise<{
  previous: PlacementResponsibilityView | null;
  current: PlacementResponsibilityView;
}> {
  const scope = await getPlacementScope(ctx);
  assertPlacementApprove(scope);

  const existing = await pool.query<PlacementResponsibilityRow>(
    `SELECT * FROM public.placement_responsibilities WHERE id = $1`,
    [id]
  );
  const row = existing.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Appointment not found");
  }
  assertPlacementInstitution(scope, row.institution_id);

  if (row.status !== "pending") {
    throw new PlacementValidationError("Only pending appointments can be decided");
  }

  // Separation of duties: requester must not approve/reject their own request.
  if (row.requested_by && row.requested_by === ctx.userId) {
    throw new AuthzError(
      "FORBIDDEN",
      "You cannot decide a placement appointment you requested"
    );
  }
  if (row.person_id === ctx.userId && decision === "approve") {
    throw new AuthzError(
      "FORBIDDEN",
      "You cannot approve an appointment for yourself"
    );
  }

  if (decision === "reject") {
    const updated = await pool.query<PlacementResponsibilityRow>(
      `UPDATE public.placement_responsibilities
          SET status = 'rejected',
              approved_by = $2,
              approved_at = now(),
              decision_note = $3
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [id, ctx.userId, optionalText(note, "note", 1000)]
    );
    const out = updated.rows[0];
    if (!out) {
      throw new PlacementValidationError("Appointment already decided");
    }
    return { previous: null, current: await hydrate(out) };
  }

  // Approve: end previous active row of same responsibility+scope (history kept).
  const closed = await pool.query<PlacementResponsibilityRow>(
    `UPDATE public.placement_responsibilities
        SET status = 'ended',
            ends_on = COALESCE(ends_on, current_date)
      WHERE institution_id = $1
        AND responsibility = $2
        AND status = 'active'
        AND COALESCE(department_id, '00000000-0000-0000-0000-000000000000')
            = COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000')
        AND id <> $4
      RETURNING *`,
    [row.institution_id, row.responsibility, row.department_id, row.id]
  );
  const previous = closed.rows[0] ? await hydrate(closed.rows[0]) : null;

  const startsOn = row.starts_on ?? new Date().toISOString().slice(0, 10);
  const updated = await pool.query<PlacementResponsibilityRow>(
    `UPDATE public.placement_responsibilities
        SET status = 'active',
            approved_by = $2,
            approved_at = now(),
            decision_note = $3,
            starts_on = $4
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [id, ctx.userId, optionalText(note, "note", 1000), startsOn]
  );
  const out = updated.rows[0];
  if (!out) {
    throw new PlacementValidationError("Appointment already decided");
  }
  return { previous, current: await hydrate(out) };
}

/** End an active appointment (handover/close). Director/Dean only. */
export async function endPlacementResponsibility(
  ctx: AuthContext,
  id: string,
  note?: string
): Promise<PlacementResponsibilityView> {
  const scope = await getPlacementScope(ctx);
  assertPlacementApprove(scope);

  const existing = await pool.query<PlacementResponsibilityRow>(
    `SELECT * FROM public.placement_responsibilities WHERE id = $1`,
    [id]
  );
  const row = existing.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Appointment not found");
  }
  assertPlacementInstitution(scope, row.institution_id);
  if (row.status !== "active") {
    throw new PlacementValidationError("Only active appointments can be ended");
  }

  const updated = await pool.query<PlacementResponsibilityRow>(
    `UPDATE public.placement_responsibilities
        SET status = 'ended',
            ends_on = current_date,
            decision_note = COALESCE(NULLIF($2, ''), decision_note)
      WHERE id = $1 AND status = 'active'
      RETURNING *`,
    [id, optionalText(note, "note", 1000)]
  );
  const out = updated.rows[0];
  if (!out) {
    throw new PlacementValidationError("Appointment already closed");
  }
  return hydrate(out);
}

/** List appointment history (institution-scoped). */
export async function listPlacementResponsibilities(
  ctx: AuthContext,
  query: { status?: string; limit?: number } = {}
): Promise<PlacementResponsibilityView[]> {
  const scope = await getPlacementScope(ctx);
  assertPlacementAccess(scope, "approver", "oversight", "operator", "student");
  if (!ctx.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }

  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const params: unknown[] = [ctx.institutionId];
  let statusClause = "";
  if (query.status) {
    params.push(query.status);
    statusClause = `AND r.status = $${params.length}`;
  }
  params.push(limit);

  const result = await pool.query<PlacementResponsibilityView>(
    `${SELECT_RESP}
      WHERE r.institution_id = $1 ${statusClause}
      ORDER BY r.created_at DESC
      LIMIT $${params.length}`,
    params
  );
  // Students may only see their own appointments.
  if (scope.access === "student") {
    return result.rows.filter((r) => r.person_id === ctx.userId);
  }
  return result.rows;
}

/** Active appointment rows used for scope checks elsewhere. */
export async function getActiveTpo(
  institutionId: string
): Promise<PlacementResponsibilityView | null> {
  const result = await pool.query<PlacementResponsibilityRow>(
    `SELECT * FROM public.placement_responsibilities
      WHERE institution_id = $1 AND responsibility = 'tpo' AND status = 'active'
      LIMIT 1`,
    [institutionId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return hydrate(row);
}

export async function assertCanCreateAppointment(ctx: AuthContext): Promise<void> {
  const scope: PlacementScope = await getPlacementScope(ctx);
  if (!scope.canCreateAppointments) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only Director/Dean or institution admin may request placement appointments"
    );
  }
}
