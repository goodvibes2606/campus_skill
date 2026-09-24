import { pool } from "@/lib/db";
import { AuthzError, ROLES, type AuthContext } from "@/lib/authz";

/**
 * Controlled data export (Milestone 12).
 * Server-side permission + institution scope + audit.
 * Never unrestricted dumps — entity allow-list only.
 */

export const EXPORTABLE_ENTITIES = [
  "students",
  "faculty",
  "departments",
  "programs",
  "subjects",
  "sections",
  "enrollments",
  "assignments",
  "announcements",
] as const;

export type ExportEntity = (typeof EXPORTABLE_ENTITIES)[number];

const EXPORT_ROLES = [ROLES.admin, ROLES.directorDean, ROLES.hod, ROLES.tpo];

function assertCanExport(ctx: AuthContext): string {
  if (!EXPORT_ROLES.includes(ctx.roleName as never)) {
    throw new AuthzError(
      "FORBIDDEN",
      "Export is limited to institution admin, Director/Dean, HOD, and TPO"
    );
  }
  if (!ctx.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }
  return ctx.institutionId;
}

export type ExportResult = {
  entity: string;
  format: string;
  columns: string[];
  rows: (string | number | null)[][];
  rowCount: number;
  jobId: string;
};

export async function runExport(
  ctx: AuthContext,
  entity: string,
  format: "csv" | "json" = "csv"
): Promise<ExportResult> {
  const institutionId = assertCanExport(ctx);
  if (!(EXPORTABLE_ENTITIES as readonly string[]).includes(entity)) {
    throw new AuthzError("FORBIDDEN", "Export entity not allowed");
  }

  let columns: string[] = [];
  let rows: (string | number | null)[][] = [];

  if (entity === "students") {
    columns = ["id", "full_name", "email", "status"];
    const r = await pool.query<{ id: string; full_name: string; email: string; status: string }>(
      `SELECT p.id, p.full_name, p.email, p.status
         FROM public.profiles p
         JOIN public.roles ro ON ro.id = p.role_id
        WHERE p.institution_id = $1 AND ro.name = 'student'
        ORDER BY p.full_name`,
      [institutionId]
    );
    rows = r.rows.map((x) => [x.id, x.full_name, x.email, x.status]);
  } else if (entity === "faculty") {
    columns = ["id", "full_name", "email", "status", "role"];
    const r = await pool.query(
      `SELECT p.id, p.full_name, p.email, p.status, ro.name
         FROM public.profiles p
         JOIN public.roles ro ON ro.id = p.role_id
        WHERE p.institution_id = $1 AND ro.name IN ('faculty','hod','director_dean','tpo','admin')
        ORDER BY p.full_name`,
      [institutionId]
    );
    rows = (r.rows as { id: string; full_name: string; email: string; status: string; name: string }[]).map(
      (x) => [x.id, x.full_name, x.email, x.status, x.name]
    );
  } else if (entity === "departments") {
    columns = ["id", "name", "code", "status"];
    const r = await pool.query(
      `SELECT id, name, code, status FROM public.departments
        WHERE institution_id = $1 ORDER BY name`,
      [institutionId]
    );
    rows = (r.rows as { id: string; name: string; code: string; status: string }[]).map((x) => [
      x.id,
      x.name,
      x.code,
      x.status,
    ]);
  } else if (entity === "programs") {
    columns = ["id", "name", "code", "status"];
    const r = await pool.query(
      `SELECT id, name, code, status FROM public.programs
        WHERE institution_id = $1 ORDER BY name`,
      [institutionId]
    );
    rows = (r.rows as { id: string; name: string; code: string; status: string }[]).map((x) => [
      x.id,
      x.name,
      x.code,
      x.status,
    ]);
  } else if (entity === "subjects") {
    columns = ["id", "name", "code"];
    const r = await pool.query(
      `SELECT id, name, code FROM public.subjects
        WHERE institution_id = $1 ORDER BY name`,
      [institutionId]
    );
    rows = (r.rows as { id: string; name: string; code: string }[]).map((x) => [
      x.id,
      x.name,
      x.code,
    ]);
  } else if (entity === "sections") {
    columns = ["id", "name", "status"];
    const r = await pool.query(
      `SELECT id, name, status FROM public.sections
        WHERE institution_id = $1 ORDER BY name`,
      [institutionId]
    );
    rows = (r.rows as { id: string; name: string; status: string }[]).map((x) => [
      x.id,
      x.name,
      x.status,
    ]);
  } else if (entity === "enrollments") {
    if (ctx.roleName === ROLES.tpo) {
      throw new AuthzError("FORBIDDEN", "TPO cannot export enrollment history");
    }
    columns = ["id", "student_id", "section_id", "status", "enrolled_at"];
    const r = await pool.query(
      `SELECT id, student_id, section_id, status, enrolled_at
         FROM public.student_enrollments WHERE institution_id = $1
        ORDER BY enrolled_at DESC LIMIT 10000`,
      [institutionId]
    );
    rows = (
      r.rows as {
        id: string;
        student_id: string;
        section_id: string;
        status: string;
        enrolled_at: Date;
      }[]
    ).map((x) => [x.id, x.student_id, x.section_id, x.status, x.enrolled_at.toISOString()]);
  } else if (entity === "assignments") {
    if (ctx.roleName === ROLES.tpo) {
      throw new AuthzError("FORBIDDEN", "TPO cannot export assignments");
    }
    columns = ["id", "title", "status", "due_at"];
    const r = await pool.query(
      `SELECT id, title, status, due_at FROM public.assignments
        WHERE institution_id = $1 ORDER BY created_at DESC LIMIT 5000`,
      [institutionId]
    );
    rows = (
      r.rows as { id: string; title: string; status: string; due_at: Date | null }[]
    ).map((x) => [x.id, x.title, x.status, x.due_at?.toISOString() ?? null]);
  } else if (entity === "announcements") {
    columns = ["id", "title", "status", "priority", "published_at"];
    const r = await pool.query(
      `SELECT id, title, status, priority, published_at FROM public.announcements
        WHERE institution_id = $1 ORDER BY created_at DESC LIMIT 2000`,
      [institutionId]
    );
    rows = (
      r.rows as {
        id: string;
        title: string;
        status: string;
        priority: string;
        published_at: Date | null;
      }[]
    ).map((x) => [
      x.id,
      x.title,
      x.status,
      x.priority,
      x.published_at?.toISOString() ?? null,
    ]);
  }

  const job = await pool.query<{ id: string }>(
    `INSERT INTO public.export_jobs
        (institution_id, entity_type, format, status, row_count, requested_by, filters)
     VALUES ($1,$2,$3,'completed',$4,$5,$6)
     RETURNING id`,
    [
      institutionId,
      entity,
      format,
      rows.length,
      ctx.userId,
      JSON.stringify({ role: ctx.roleName }),
    ]
  );

  await pool.query(
    `INSERT INTO public.institution_config_audit
        (institution_id, changed_by, area, action, status, new_value)
     VALUES ($1,$2,'export','run','completed',$3)`,
    [
      institutionId,
      ctx.userId,
      JSON.stringify({ entity, format, rows: rows.length, job_id: job.rows[0].id }),
    ]
  );

  if (format === "json") {
    const objects = rows.map((r) => {
      const o: Record<string, string | number | null> = {};
      columns.forEach((c, i) => {
        o[c] = r[i];
      });
      return o;
    });
    return {
      entity,
      format,
      columns,
      rows,
      rowCount: rows.length,
      jobId: job.rows[0].id,
      // caller serializes objects for json
      ...( { objects } as object),
    } as ExportResult;
  }

  return {
    entity,
    format,
    columns,
    rows,
    rowCount: rows.length,
    jobId: job.rows[0].id,
  };
}

export function toCsv(columns: string[], rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = columns.map(esc).join(",");
  const body = rows.map((r) => r.map(esc).join(",")).join("\n");
  return `${head}\n${body}\n`;
}
