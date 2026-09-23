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
  isDailyWorkItemType,
  isDailyWorkStatus,
  type DailyWorkItemType,
  type DailyWorkStatus,
} from "@/lib/academic-ops-types";
import { createNotification } from "@/lib/notifications";

/**
 * Daily work reporting (Milestone 5).
 * Faculty/HOD submit daily work; HOD/admin may acknowledge or return.
 */

export type DailyWorkReportRow = {
  id: string;
  institution_id: string;
  department_id: string | null;
  reporter_id: string;
  report_date: string | Date;
  summary: string;
  status: DailyWorkStatus;
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
  return_note: string | null;
  created_at: Date;
  updated_at: Date;
};

export type DailyWorkItemRow = {
  id: string;
  report_id: string;
  institution_id: string;
  work_type: DailyWorkItemType;
  subject_id: string | null;
  section_id: string | null;
  description: string;
  duration_minutes: number | null;
  created_at: Date;
  updated_at: Date;
};

export type DailyWorkReportView = DailyWorkReportRow & {
  reporter_name: string;
  department_code: string | null;
  items: DailyWorkItemRow[];
  is_reporter: boolean;
};

async function resolveReporterDepartment(
  ctx: AuthContext
): Promise<string | null> {
  if (ctx.roleName === ROLES.hod) {
    const scope = await getAcademicScope(ctx);
    const active = scope.headships.find(
      (h) => h.status === "ACTIVE" && h.valid_to === null
    );
    return active?.department_id ?? null;
  }
  const scope = await getAcademicScope(ctx);
  const active = scope.facultyAssignments.find((a) => a.status === "active");
  return active?.department_id ?? null;
}

export async function assertCanCreateDailyWork(
  ctx: AuthContext
): Promise<{ institutionId: string; departmentId: string | null }> {
  if (
    ctx.roleName === ROLES.faculty ||
    ctx.roleName === ROLES.hod ||
    ctx.roleName === ROLES.admin ||
    ctx.roleName === ROLES.systemAdmin ||
    ctx.roleName === ROLES.directorDean
  ) {
    const institutionId = requireInstitution(ctx);
    const departmentId = await resolveReporterDepartment(ctx);
    return { institutionId, departmentId };
  }
  throw new AuthzError(
    "FORBIDDEN",
    "Only faculty, HOD, or admin may file daily work reports"
  );
}

function parseDateOnly(v: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "")) {
    throw new AcademicOpsValidationError(`${field} must be YYYY-MM-DD`);
  }
  return v;
}

export type CreateDailyWorkInput = {
  reportDate: string;
  summary?: string;
  status?: string;
  items?: Array<{
    workType?: string;
    description: string;
    subjectId?: string | null;
    sectionId?: string | null;
    durationMinutes?: number | null;
  }>;
};

export async function createDailyWorkReport(
  ctx: AuthContext,
  input: CreateDailyWorkInput
): Promise<DailyWorkReportView> {
  const { institutionId, departmentId } = await assertCanCreateDailyWork(ctx);
  const reportDate = parseDateOnly(input.reportDate, "reportDate");
  const status =
    input.status === "submitted" || input.status === "draft"
      ? input.status
      : "draft";

  if (input.items && input.items.length > 0) {
    for (const item of input.items) {
      const desc = (item.description || "").trim();
      if (desc.length < 2 || desc.length > 2000) {
        throw new AcademicOpsValidationError(
          "Item description must be 2–2000 characters"
        );
      }
      if (item.workType && !isDailyWorkItemType(item.workType)) {
        throw new AcademicOpsValidationError("Invalid workType");
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO public.daily_work_reports (
          institution_id, department_id, reporter_id, report_date, summary, status
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [
        institutionId,
        departmentId,
        ctx.userId,
        reportDate,
        (input.summary || "").trim().slice(0, 4000),
        status,
      ]
    );
    const reportId = inserted.rows[0].id;

    for (const item of input.items ?? []) {
      await client.query(
        `INSERT INTO public.daily_work_items (
            report_id, institution_id, work_type, subject_id, section_id,
            description, duration_minutes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          reportId,
          institutionId,
          item.workType && isDailyWorkItemType(item.workType)
            ? item.workType
            : "other",
          item.subjectId || null,
          item.sectionId || null,
          item.description.trim().slice(0, 2000),
          item.durationMinutes ?? null,
        ]
      );
    }

    await client.query("COMMIT");
    return getDailyWorkReportView(ctx, reportId);
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      throw new AcademicOpsValidationError(
        "A report already exists for this date"
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

const SELECT_VIEW = `
  SELECT r.*,
         p.full_name AS reporter_name,
         d.code AS department_code
    FROM public.daily_work_reports r
    JOIN public.profiles p ON p.id = r.reporter_id
    LEFT JOIN public.departments d ON d.id = r.department_id
`;

async function loadReportRow(
  id: string
): Promise<DailyWorkReportRow | null> {
  const result = await pool.query<DailyWorkReportRow>(
    `SELECT * FROM public.daily_work_reports WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function assertCanAccessDailyWork(
  ctx: AuthContext,
  reportId: string
): Promise<DailyWorkReportRow> {
  const row = await loadReportRow(reportId);
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Daily work report not found");
  }

  if (ctx.roleName === ROLES.systemAdmin) return row;
  if (ctx.roleName === ROLES.admin || ctx.roleName === ROLES.directorDean) {
    assertInstitution(ctx, row.institution_id);
    return row;
  }
  if (row.reporter_id === ctx.userId) return row;

  if (ctx.roleName === ROLES.hod) {
    assertInstitution(ctx, row.institution_id);
    if (row.department_id) {
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
      "HOD may only view reports in headed department"
    );
  }

  // Other faculty: cannot read peers' reports
  throw new AuthzError(
    "FORBIDDEN",
    "Daily work reports are private to reporter and HOD/admin"
  );
}

export async function getDailyWorkReportView(
  ctx: AuthContext,
  reportId: string
): Promise<DailyWorkReportView> {
  await assertCanAccessDailyWork(ctx, reportId);
  const view = await pool.query<DailyWorkReportView>(
    `${SELECT_VIEW} WHERE r.id = $1`,
    [reportId]
  );
  const out = view.rows[0];
  if (!out) {
    throw new AuthzError("FORBIDDEN", "Daily work report not found");
  }
  const items = await pool.query<DailyWorkItemRow>(
    `SELECT * FROM public.daily_work_items
      WHERE report_id = $1
      ORDER BY created_at ASC`,
    [reportId]
  );
  return {
    ...out,
    items: items.rows,
    is_reporter: out.reporter_id === ctx.userId,
  };
}

export type ListDailyWorkQuery = {
  reporterId?: string;
  date?: string;
  status?: string;
  departmentId?: string;
  limit?: number;
};

export async function listDailyWorkReports(
  ctx: AuthContext,
  query: ListDailyWorkQuery = {}
): Promise<DailyWorkReportView[]> {
  const params: unknown[] = [];
  const parts: string[] = [];
  const push = (sql: string, ...values: unknown[]) => {
    const start = params.length + 1;
    params.push(...values);
    let i = start;
    parts.push(sql.replace(/\?/g, () => `$${i++}`));
  };

  if (query.date) {
    push(`r.report_date = ?::date`, parseDateOnly(query.date, "date"));
  }
  if (query.status && isDailyWorkStatus(query.status)) {
    push(`r.status = ?`, query.status);
  }
  if (query.departmentId) {
    push(`r.department_id = ?::uuid`, query.departmentId);
  }

  if (ctx.roleName === ROLES.systemAdmin) {
    // any
  } else if (ctx.roleName === ROLES.admin || ctx.roleName === ROLES.directorDean) {
    push(`r.institution_id = ?::uuid`, ctx.institutionId);
  } else if (ctx.roleName === ROLES.hod) {
    push(`r.institution_id = ?::uuid`, ctx.institutionId);
    const scope = await getAcademicScope(ctx);
    const deptIds = scope.headships
      .filter((h) => h.status === "ACTIVE" && h.valid_to === null)
      .map((h) => h.department_id);
    if (query.reporterId) {
      push(`r.reporter_id = ?::uuid`, query.reporterId);
      push(`r.reporter_id = ?::uuid`, ctx.userId === query.reporterId ? ctx.userId : query.reporterId);
      // if viewing someone else, require they are in headed dept
      if (query.reporterId !== ctx.userId) {
        if (deptIds.length === 0) {
          push(`FALSE`);
        } else {
          const ors = deptIds.map((id) => {
            const s = params.length + 1;
            params.push(id);
            return `r.department_id = $${s}`;
          });
          parts.push(`(${ors.join(" OR ")})`);
        }
      }
    } else if (deptIds.length > 0) {
      const ors = deptIds.map((id) => {
        const s = params.length + 1;
        params.push(id);
        return `r.department_id = $${s}`;
      });
      ors.push(`r.reporter_id = $${params.length + 1}`);
      params.push(ctx.userId);
      parts.push(`(${ors.join(" OR ")})`);
    } else {
      push(`r.reporter_id = ?::uuid`, ctx.userId);
    }
  } else if (ctx.roleName === ROLES.faculty) {
    push(`r.institution_id = ?::uuid`, ctx.institutionId);
    push(`r.reporter_id = ?::uuid`, ctx.userId);
  } else {
    push(`FALSE`);
  }

  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const sql = `${SELECT_VIEW}
    ${parts.length ? `WHERE ${parts.join(" AND ")}` : ""}
    ORDER BY r.report_date DESC, r.created_at DESC
    LIMIT ${limit}`;

  const result = await pool.query<DailyWorkReportView>(
    sql,
    params as never[]
  );

  const reports = result.rows;
  for (const report of reports) {
    const items = await pool.query<DailyWorkItemRow>(
      `SELECT * FROM public.daily_work_items
        WHERE report_id = $1 ORDER BY created_at ASC`,
      [report.id]
    );
    report.items = items.rows;
    report.is_reporter = report.reporter_id === ctx.userId;
  }
  return reports;
}

export type UpdateDailyWorkInput = {
  summary?: string;
  status?: string;
  returnNote?: string;
};

export async function updateDailyWorkReport(
  ctx: AuthContext,
  reportId: string,
  input: UpdateDailyWorkInput
): Promise<DailyWorkReportView> {
  const row = await assertCanAccessDailyWork(ctx, reportId);
  const isReporter = row.reporter_id === ctx.userId;
  const isAdmin =
    ctx.roleName === ROLES.admin ||
    ctx.roleName === ROLES.systemAdmin ||
    ctx.roleName === ROLES.directorDean;
  const isHodOfDept = await (async () => {
    if (ctx.roleName !== ROLES.hod || !row.department_id) return false;
    const scope = await getAcademicScope(ctx);
    return scope.headships.some(
      (h) =>
        h.status === "ACTIVE" &&
        h.valid_to === null &&
        h.department_id === row.department_id
    );
  })();

  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (col: string, val: unknown) => {
    values.push(val);
    fields.push(`${col} = $${values.length}`);
  };

  if (input.summary !== undefined) {
    if (!isReporter) {
      throw new AuthzError("FORBIDDEN", "Only reporter may edit summary");
    }
    if (row.status === "acknowledged") {
      throw new AcademicOpsValidationError(
        "Cannot edit acknowledged report"
      );
    }
    set("summary", input.summary.trim().slice(0, 4000));
  }

  if (input.status !== undefined) {
    if (!isDailyWorkStatus(input.status)) {
      throw new AcademicOpsValidationError("Invalid status");
    }
    const to = input.status;
    if (to !== row.status) {
      if (to === "submitted") {
        if (!isReporter) {
          throw new AuthzError("FORBIDDEN", "Only reporter may submit");
        }
        if (row.status !== "draft" && row.status !== "returned") {
          throw new AcademicOpsValidationError(
            `Cannot submit from ${row.status}`
          );
        }
        set("status", to);
      } else if (to === "draft") {
        if (!isReporter) {
          throw new AuthzError("FORBIDDEN", "Only reporter may unsubmit");
        }
        if (row.status !== "submitted" && row.status !== "returned") {
          throw new AcademicOpsValidationError(
            `Cannot return to draft from ${row.status}`
          );
        }
        set("status", to);
      } else if (to === "acknowledged") {
        if (!isHodOfDept && !isAdmin) {
          throw new AuthzError(
            "FORBIDDEN",
            "Only HOD or admin may acknowledge"
          );
        }
        if (row.status !== "submitted") {
          throw new AcademicOpsValidationError(
            "Only submitted reports may be acknowledged"
          );
        }
        set("status", to);
        set("acknowledged_by", ctx.userId);
        set("acknowledged_at", new Date());
        set("return_note", null);
      } else if (to === "returned") {
        if (!isHodOfDept && !isAdmin) {
          throw new AuthzError("FORBIDDEN", "Only HOD or admin may return");
        }
        if (row.status !== "submitted") {
          throw new AcademicOpsValidationError(
            "Only submitted reports may be returned"
          );
        }
        set("status", to);
        set("return_note", input.returnNote?.trim().slice(0, 1000) || null);
        set("acknowledged_by", null);
        set("acknowledged_at", null);
      } else {
        throw new AcademicOpsValidationError(`Invalid status ${to}`);
      }
    }
  }

  if (fields.length === 0) {
    return getDailyWorkReportView(ctx, reportId);
  }

  await pool.query(
    `UPDATE public.daily_work_reports SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $${values.length + 1}`,
    [...values, reportId] as never[]
  );

  const after = await loadReportRow(reportId);
  if (after && input.status && after.status !== row.status) {
    if (after.status === "submitted") {
      await notifyHodOfDepartment(ctx, {
        departmentId: after.department_id,
        institutionId: after.institution_id,
        event: "daily_work.submitted",
        title: "Daily work submitted",
        body: `Report for ${String(after.report_date).slice(0, 10)} is awaiting acknowledgement.`,
        excludeUserId: after.reporter_id,
      });
    } else if (after.reporter_id !== ctx.userId) {
      await createNotification(ctx, {
        recipientId: after.reporter_id,
        event: `daily_work.${after.status}`,
        title: `Daily work ${after.status}`,
        body:
          after.status === "returned"
            ? after.return_note || "Report returned for revision."
            : `Your report for ${String(after.report_date).slice(0, 10)} was ${after.status}.`,
        priority: "normal",
        institutionId: after.institution_id,
      });
    }
  }

  return getDailyWorkReportView(ctx, reportId);
}

async function notifyHodOfDepartment(
  ctx: AuthContext,
  params: {
    departmentId: string | null;
    institutionId: string;
    event: string;
    title: string;
    body: string;
    excludeUserId: string;
  }
): Promise<void> {
  if (!params.departmentId) {
    // No department — no HOD fan-out; foundation no-op for institution admins
    return;
  }

  const heads = await pool.query<{ hod_id: string }>(
    `SELECT hod_id
       FROM public.department_heads
      WHERE department_id = $1
        AND valid_to IS NULL`,
    [params.departmentId]
  );

  for (const h of heads.rows) {
    if (h.hod_id === params.excludeUserId) continue;
    if (h.hod_id === ctx.userId) continue;
    await createNotification(ctx, {
      recipientId: h.hod_id,
      event: params.event,
      title: params.title,
      body: params.body,
      priority: "normal",
      institutionId: params.institutionId,
    });
  }
}
