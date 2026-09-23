import { pool } from "@/lib/db";
import {
  AuthzError,
  assertInstitution,
  requireInstitution,
  ROLES,
  type AuthContext,
} from "@/lib/authz";
import { getAcademicScope } from "@/lib/academic-scope";
import {
  AcademicOpsValidationError,
  canTransitionCalendar,
  isCalendarEventType,
  isCalendarStatus,
  type CalendarEventType,
  type CalendarStatus,
} from "@/lib/academic-ops-types";
import { createNotification, notifyInstitution } from "@/lib/notifications";

/**
 * Academic calendar domain (Milestone 5).
 * Institutional dates + approval state + circulation foundation.
 *
 * Lifecycle:
 *   draft → pending_approval → approved → published (circulate) → archived
 *   pending_approval → rejected → draft
 *
 * Approval foundation: HOD (scoped dept or institution-wide) / admin / system_admin / director_dean.
 * Circulation: setting published stores circulated_by/at and fans out in-app notifications.
 */

export type CalendarEventRow = {
  id: string;
  institution_id: string;
  department_id: string | null;
  academic_year_id: string | null;
  title: string;
  description: string;
  event_type: CalendarEventType;
  starts_on: string | Date;
  ends_on: string | Date;
  status: CalendarStatus;
  created_by: string;
  submitted_by: string | null;
  submitted_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  approval_note: string | null;
  circulated_by: string | null;
  circulated_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type CalendarEventView = CalendarEventRow & {
  creator_name: string;
  academic_year_name: string | null;
  department_code: string | null;
  is_creator: boolean;
};

const SELECT_VIEW = `
  SELECT e.*,
         c.full_name AS creator_name,
         ay.name AS academic_year_name,
         d.code AS department_code
    FROM public.academic_calendar_events e
    JOIN public.profiles c ON c.id = e.created_by
    LEFT JOIN public.academic_years ay ON ay.id = e.academic_year_id
    LEFT JOIN public.departments d ON d.id = e.department_id
`;

type ScopeFilter = {
  where: string;
  params: unknown[];
};

async function buildVisibilityFilter(
  ctx: AuthContext,
  query: { status?: string; from?: string; to?: string }
): Promise<ScopeFilter> {
  const params: unknown[] = [];
  const parts: string[] = [];
  const push = (sql: string, ...values: unknown[]) => {
    const start = params.length + 1;
    params.push(...values);
    let i = start;
    parts.push(sql.replace(/\?/g, () => `$${i++}`));
  };

  if (query.status && isCalendarStatus(query.status)) {
    push(`e.status = ?`, query.status);
  }
  if (query.from) {
    push(`e.ends_on >= ?::date`, query.from);
  }
  if (query.to) {
    push(`e.starts_on <= ?::date`, query.to);
  }

  if (ctx.roleName === ROLES.systemAdmin) {
    // any institution
  } else if (ctx.roleName === ROLES.admin || ctx.roleName === ROLES.directorDean) {
    push(`e.institution_id = ?::uuid`, ctx.institutionId);
  } else if (ctx.roleName === ROLES.student) {
    const scope = await getAcademicScope(ctx);
    const enr = scope.enrollment;
    if (!enr || enr.status !== "active") {
      push(`FALSE`);
    } else {
      push(`e.institution_id = ?::uuid`, enr.institution_id);
      push(
        `(e.status = 'published' OR e.created_by = ?::uuid)`,
        ctx.userId
      );
      // Department-scoped drafts must not leak: published OR own OR no dept filter
      // handled by status check above for non-owners.
    }
  } else if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    push(`e.institution_id = ?::uuid`, ctx.institutionId);

    const orClauses: string[] = [];
    const start = params.length + 1;
    let i = start;

    orClauses.push(`e.created_by = $${i++}`);
    params.push(ctx.userId);
    orClauses.push(`e.status IN ('published', 'approved')`);
    orClauses.push(`e.department_id IS NULL`);

    if (ctx.roleName === ROLES.hod) {
      for (const h of scope.headships) {
        if (h.status !== "ACTIVE" || h.valid_to !== null) continue;
        orClauses.push(`e.department_id = $${i++}`);
        params.push(h.department_id);
      }
    }

    parts.push(`(${orClauses.join(" OR ")})`);
  } else {
    push(`e.institution_id = ?::uuid`, ctx.institutionId);
    push(`e.status = 'published'`);
  }

  return {
    where: parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "",
    params,
  };
}

export type ListCalendarQuery = {
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export async function listCalendarEvents(
  ctx: AuthContext,
  query: ListCalendarQuery = {}
): Promise<CalendarEventView[]> {
  const filter = await buildVisibilityFilter(ctx, query);
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const sql = `${SELECT_VIEW}
    ${filter.where}
    ORDER BY e.starts_on ASC, e.created_at DESC
    LIMIT ${limit}`;
  const result = await pool.query<CalendarEventView>(
    sql,
    filter.params as never[]
  );
  return result.rows.map((row) => ({
    ...row,
    is_creator: row.created_by === ctx.userId,
  }));
}

async function loadEventRow(id: string): Promise<CalendarEventRow | null> {
  const result = await pool.query<CalendarEventRow>(
    `SELECT * FROM public.academic_calendar_events WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function assertCanAccessCalendarEvent(
  ctx: AuthContext,
  eventId: string
): Promise<CalendarEventRow> {
  const row = await loadEventRow(eventId);
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Calendar event not found");
  }

  if (ctx.roleName === ROLES.systemAdmin) return row;
  if (ctx.roleName === ROLES.admin || ctx.roleName === ROLES.directorDean) {
    assertInstitution(ctx, row.institution_id);
    return row;
  }

  if (ctx.roleName === ROLES.student) {
    if (row.institution_id !== ctx.institutionId) {
      throw new AuthzError("FORBIDDEN", "Institution access denied");
    }
    if (row.status !== "published" && row.created_by !== ctx.userId) {
      throw new AuthzError("FORBIDDEN", "Calendar event not published");
    }
    return row;
  }

  // faculty / HOD
  assertInstitution(ctx, row.institution_id);
  if (row.created_by === ctx.userId) return row;
  if (row.status === "published" || row.status === "approved") return row;
  if (row.department_id === null) return row;

  if (ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    const heads = scope.headships.some(
      (h) =>
        h.status === "ACTIVE" &&
        h.valid_to === null &&
        h.department_id === row.department_id
    );
    if (heads) return row;
  }

  throw new AuthzError(
    "FORBIDDEN",
    "Calendar event outside your visibility scope"
  );
}

export type CreateCalendarInput = {
  title: string;
  description?: string;
  eventType?: string;
  startsOn: string;
  endsOn: string;
  academicYearId?: string | null;
  departmentId?: string | null;
};

async function assertCanCreateCalendar(
  ctx: AuthContext,
  departmentId: string | null
): Promise<string> {
  const institutionId = requireInstitution(ctx);

  if (
    ctx.roleName === ROLES.admin ||
    ctx.roleName === ROLES.systemAdmin ||
    ctx.roleName === ROLES.directorDean
  ) {
    return institutionId;
  }

  if (ctx.roleName === ROLES.hod) {
    if (!departmentId) {
      // HOD creating institution-wide date: allow (approval still required)
      return institutionId;
    }
    const scope = await getAcademicScope(ctx);
    const heads = scope.headships.some(
      (h) =>
        h.status === "ACTIVE" &&
        h.valid_to === null &&
        h.department_id === departmentId
    );
    if (heads) return institutionId;
    throw new AuthzError(
      "FORBIDDEN",
      "HOD not authorized for this department"
    );
  }

  if (ctx.roleName === ROLES.faculty) {
    if (departmentId) {
      const scope = await getAcademicScope(ctx);
      const coversDept = scope.facultyAssignments.some(
        (a) => a.status === "active" && a.department_id === departmentId
      );
      if (coversDept) return institutionId;
    } else {
      // institution-wide draft by faculty still needs approval before publish
      return institutionId;
    }
    throw new AuthzError(
      "FORBIDDEN",
      "Faculty not authorized for this department scope"
    );
  }

  throw new AuthzError(
    "FORBIDDEN",
    "Only faculty, HOD, or admin may create calendar events"
  );
}

function parseDateOnly(v: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "")) {
    throw new AcademicOpsValidationError(
      `${field} must be YYYY-MM-DD`
    );
  }
  return v;
}

export async function createCalendarEvent(
  ctx: AuthContext,
  input: CreateCalendarInput
): Promise<CalendarEventView> {
  const title = (input.title || "").trim();
  if (title.length < 2 || title.length > 200) {
    throw new AcademicOpsValidationError("Title must be 2–200 characters");
  }
  const startsOn = parseDateOnly(input.startsOn, "startsOn");
  const endsOn = parseDateOnly(input.endsOn, "endsOn");
  if (endsOn < startsOn) {
    throw new AcademicOpsValidationError("endsOn must be ≥ startsOn");
  }
  const eventType = isCalendarEventType(input.eventType)
    ? input.eventType
    : "event";
  const departmentId = input.departmentId || null;

  const institutionId = await assertCanCreateCalendar(ctx, departmentId);

  if (departmentId) {
    const dept = await pool.query<{ institution_id: string }>(
      `SELECT institution_id FROM public.departments WHERE id = $1`,
      [departmentId]
    );
    if (!dept.rows[0]) {
      throw new AuthzError("FORBIDDEN", "Department not found");
    }
    assertInstitution(ctx, dept.rows[0].institution_id);
  }

  if (input.academicYearId) {
    const year = await pool.query<{ institution_id: string }>(
      `SELECT institution_id FROM public.academic_years WHERE id = $1`,
      [input.academicYearId]
    );
    if (!year.rows[0]) {
      throw new AuthzError("FORBIDDEN", "Academic year not found");
    }
    assertInstitution(ctx, year.rows[0].institution_id);
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO public.academic_calendar_events (
        institution_id, department_id, academic_year_id,
        title, description, event_type, starts_on, ends_on, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      institutionId,
      departmentId,
      input.academicYearId || null,
      title,
      (input.description || "").trim().slice(0, 2000),
      eventType,
      startsOn,
      endsOn,
      ctx.userId,
    ]
  );

  return getCalendarEventView(ctx, inserted.rows[0].id);
}

export async function getCalendarEventView(
  ctx: AuthContext,
  eventId: string
): Promise<CalendarEventView> {
  await assertCanAccessCalendarEvent(ctx, eventId);
  const view = await pool.query<CalendarEventView>(
    `${SELECT_VIEW} WHERE e.id = $1`,
    [eventId]
  );
  const out = view.rows[0];
  if (!out) {
    throw new AuthzError("FORBIDDEN", "Calendar event not found");
  }
  return { ...out, is_creator: out.created_by === ctx.userId };
}

/** Approval authority: HOD (dept or institution-wide events), admin+ roles. */
async function assertCanApproveCalendar(
  ctx: AuthContext,
  row: CalendarEventRow
): Promise<void> {
  if (
    ctx.roleName === ROLES.admin ||
    ctx.roleName === ROLES.systemAdmin ||
    ctx.roleName === ROLES.directorDean
  ) {
    return;
  }
  if (ctx.roleName === ROLES.hod) {
    if (row.department_id === null) {
      // HOD may approve institution-wide foundation events
      return;
    }
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
    "Only HOD of department, admin, or system_admin may approve/publish"
  );
}

async function assertCanEditCalendar(
  ctx: AuthContext,
  row: CalendarEventRow
): Promise<void> {
  if (row.created_by === ctx.userId) return;
  if (
    ctx.roleName === ROLES.admin ||
    ctx.roleName === ROLES.systemAdmin ||
    ctx.roleName === ROLES.directorDean
  ) {
    return;
  }
  if (ctx.roleName === ROLES.hod) {
    if (row.department_id === null) return;
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
    "Only creator, HOD, or admin may modify this event"
  );
}

export type UpdateCalendarInput = {
  title?: string;
  description?: string;
  eventType?: string;
  startsOn?: string;
  endsOn?: string;
  status?: string;
  approvalNote?: string;
};

export async function updateCalendarEvent(
  ctx: AuthContext,
  eventId: string,
  input: UpdateCalendarInput
): Promise<CalendarEventView> {
  const row = await assertCanAccessCalendarEvent(ctx, eventId);

  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (col: string, val: unknown) => {
    values.push(val);
    fields.push(`${col} = $${values.length}`);
  };

  const contentTouched =
    input.title !== undefined ||
    input.description !== undefined ||
    input.eventType !== undefined ||
    input.startsOn !== undefined ||
    input.endsOn !== undefined;

  if (contentTouched) {
    if (row.status !== "draft" && row.status !== "rejected") {
      throw new AcademicOpsValidationError(
        "Only draft/rejected events may be edited"
      );
    }
    await assertCanEditCalendar(ctx, row);
  }

  if (input.title !== undefined) {
    const t = input.title.trim();
    if (t.length < 2 || t.length > 200) {
      throw new AcademicOpsValidationError("Title must be 2–200 characters");
    }
    set("title", t);
  }
  if (input.description !== undefined) {
    set("description", input.description.trim().slice(0, 2000));
  }
  if (input.eventType !== undefined) {
    if (!isCalendarEventType(input.eventType)) {
      throw new AcademicOpsValidationError("Invalid eventType");
    }
    set("event_type", input.eventType);
  }

  let startsOn = row.starts_on instanceof Date
    ? row.starts_on.toISOString().slice(0, 10)
    : String(row.starts_on);
  let endsOn = row.ends_on instanceof Date
    ? row.ends_on.toISOString().slice(0, 10)
    : String(row.ends_on);

  if (input.startsOn !== undefined) {
    startsOn = parseDateOnly(input.startsOn, "startsOn");
    set("starts_on", startsOn);
  }
  if (input.endsOn !== undefined) {
    endsOn = parseDateOnly(input.endsOn, "endsOn");
    set("ends_on", endsOn);
  }
  if (endsOn < startsOn) {
    throw new AcademicOpsValidationError("endsOn must be ≥ startsOn");
  }

  let notifyCirculate = false;

  if (input.status !== undefined) {
    if (!isCalendarStatus(input.status)) {
      throw new AcademicOpsValidationError("Invalid status");
    }
    const to = input.status;
    if (to !== row.status) {
      if (!canTransitionCalendar(row.status, to)) {
        throw new AcademicOpsValidationError(
          `Invalid calendar transition ${row.status} → ${to}`
        );
      }

      if (to === "pending_approval") {
        await assertCanEditCalendar(ctx, row);
        set("status", to);
        set("submitted_by", ctx.userId);
        set("submitted_at", new Date());
        set("rejected_by", null);
        set("rejected_at", null);
        set("approval_note", null);
      } else if (to === "approved") {
        await assertCanApproveCalendar(ctx, row);
        if (ctx.userId === row.created_by && ctx.roleName === ROLES.faculty) {
          throw new AuthzError(
            "FORBIDDEN",
            "Faculty may not self-approve calendar events"
          );
        }
        set("status", to);
        set("approved_by", ctx.userId);
        set("approved_at", new Date());
        set("rejected_by", null);
        set("rejected_at", null);
        set(
          "approval_note",
          input.approvalNote?.trim().slice(0, 1000) || row.approval_note
        );
      } else if (to === "rejected") {
        await assertCanApproveCalendar(ctx, row);
        set("status", to);
        set("rejected_by", ctx.userId);
        set("rejected_at", new Date());
        set("approval_note", input.approvalNote?.trim().slice(0, 1000) || null);
        set("approved_by", null);
        set("approved_at", null);
      } else if (to === "published") {
        await assertCanApproveCalendar(ctx, row);
        if (row.status !== "approved") {
          throw new AcademicOpsValidationError(
            "Calendar events must be approved before publish/circulation"
          );
        }
        set("status", to);
        set("circulated_by", ctx.userId);
        set("circulated_at", new Date());
        notifyCirculate = true;
      } else if (to === "draft") {
        await assertCanEditCalendar(ctx, row);
        set("status", to);
        set("submitted_by", null);
        set("submitted_at", null);
        set("approved_by", null);
        set("approved_at", null);
        set("rejected_by", null);
        set("rejected_at", null);
        set("approval_note", input.approvalNote?.trim().slice(0, 1000) || null);
        set("circulated_by", null);
        set("circulated_at", null);
      } else if (to === "archived") {
        await assertCanApproveCalendar(ctx, row);
        set("status", to);
      }
    }
  }

  if (fields.length === 0) {
    return getCalendarEventView(ctx, eventId);
  }

  await pool.query(
    `UPDATE public.academic_calendar_events
        SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $${values.length + 1}`,
    [...values, eventId] as never[]
  );

  const after = await loadEventRow(eventId);
  if (notifyCirculate && after) {
    await notifyInstitution({
      institutionId: after.institution_id,
      event: "calendar.event_published",
      title: `Calendar: ${after.title}`,
      body: `${after.starts_on instanceof Date ? after.starts_on.toISOString().slice(0, 10) : after.starts_on} · ${after.event_type} is now published.`,
      priority: "normal",
      excludeUserId: ctx.userId,
      createdBy: ctx.userId,
    });
  } else if (after && input.status) {
    await createNotification(ctx, {
      recipientId: after.created_by,
      event: "calendar.status_changed",
      title: `Calendar "${after.title}" → ${after.status}`,
      body:
        after.status === "rejected"
          ? `Rejected${after.approval_note ? `: ${after.approval_note}` : ""}`
          : `Status is now ${after.status}.`,
      priority: after.status === "rejected" ? "high" : "normal",
      institutionId: after.institution_id,
      skipSelf: true,
    });
  }

  return getCalendarEventView(ctx, eventId);
}
