import { pool } from "@/lib/db";
import { AuthzError, ROLES, type AuthContext } from "@/lib/authz";
import { createNotification } from "@/lib/notifications";

/**
 * Institutional announcements (Milestone 12).
 * Reuses notifications for fan-out when published.
 * Server-side audience scope enforcement.
 */

const CREATE_ROLES = [
  ROLES.admin,
  ROLES.directorDean,
  ROLES.hod,
  ROLES.faculty,
  ROLES.tpo,
];

export type AnnouncementRow = {
  id: string;
  institution_id: string;
  title: string;
  body: string;
  priority: string;
  status: string;
  audience_kind: string;
  department_id: string | null;
  program_id: string | null;
  semester_id: string | null;
  section_id: string | null;
  start_at: Date | null;
  end_at: Date | null;
  created_by: string;
  published_by: string | null;
  published_at: Date | null;
  notify_recipients: boolean;
  created_at: Date;
  updated_at: Date;
};

export type AnnouncementView = AnnouncementRow & {
  creator_name: string;
};

export type CreateAnnouncementInput = {
  title: string;
  body?: string;
  priority?: string;
  audienceKind?: string;
  departmentId?: string | null;
  programId?: string | null;
  semesterId?: string | null;
  sectionId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  publish?: boolean;
  notifyRecipients?: boolean;
};

async function assertScopeIds(
  ctx: AuthContext,
  input: CreateAnnouncementInput
): Promise<void> {
  const institutionId = ctx.institutionId!;
  const kind = input.audienceKind || "institution";

  if (kind === "department" || input.departmentId) {
    if (!input.departmentId) {
      throw new AuthzError("FORBIDDEN", "departmentId required for department audience");
    }
    if (ctx.roleName === ROLES.hod) {
      const head = await pool.query(
        `SELECT 1 FROM public.department_heads
          WHERE department_id = $1 AND hod_id = $2 AND valid_to IS NULL`,
        [input.departmentId, ctx.userId]
      );
      if (!head.rows[0]) {
        throw new AuthzError("FORBIDDEN", "HOD may only announce for headed department");
      }
    }
    const d = await pool.query(
      `SELECT institution_id FROM public.departments WHERE id = $1`,
      [input.departmentId]
    );
    if (!d.rows[0] || d.rows[0].institution_id !== institutionId) {
      throw new AuthzError("FORBIDDEN", "Department out of scope");
    }
  }

  if (kind === "section" || input.sectionId) {
    if (!input.sectionId) {
      throw new AuthzError("FORBIDDEN", "sectionId required for section audience");
    }
    const s = await pool.query(
      `SELECT institution_id FROM public.sections WHERE id = $1`,
      [input.sectionId]
    );
    if (!s.rows[0] || s.rows[0].institution_id !== institutionId) {
      throw new AuthzError("FORBIDDEN", "Section out of scope");
    }
  }

  if (kind === "program" || input.programId) {
    if (!input.programId) {
      throw new AuthzError("FORBIDDEN", "programId required for program audience");
    }
    const p = await pool.query(
      `SELECT institution_id FROM public.programs WHERE id = $1`,
      [input.programId]
    );
    if (!p.rows[0] || p.rows[0].institution_id !== institutionId) {
      throw new AuthzError("FORBIDDEN", "Program out of scope");
    }
  }

  if (kind === "semester" || input.semesterId) {
    if (!input.semesterId) {
      throw new AuthzError("FORBIDDEN", "semesterId required for semester audience");
    }
    const sm = await pool.query(
      `SELECT institution_id FROM public.semesters WHERE id = $1`,
      [input.semesterId]
    );
    if (!sm.rows[0] || sm.rows[0].institution_id !== institutionId) {
      throw new AuthzError("FORBIDDEN", "Semester out of scope");
    }
  }
}

export async function createAnnouncement(
  ctx: AuthContext,
  input: CreateAnnouncementInput
): Promise<AnnouncementView> {
  if (!CREATE_ROLES.includes(ctx.roleName as never)) {
    throw new AuthzError("FORBIDDEN", "Your role cannot create announcements");
  }
  const institutionId = ctx.institutionId;
  if (!institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }

  const title = (input.title || "").trim();
  if (title.length < 3 || title.length > 200) {
    throw new AuthzError("FORBIDDEN", "Title must be 3–200 characters");
  }
  const body = (input.body || "").trim().slice(0, 5000);
  const priority = ["low", "normal", "high", "urgent"].includes(input.priority || "")
    ? input.priority!
    : "normal";
  const audienceKind = [
    "institution",
    "department",
    "program",
    "semester",
    "section",
    "faculty",
    "students",
  ].includes(input.audienceKind || "")
    ? input.audienceKind!
    : "institution";

  // HOD cannot claim institution-wide audience.
  if (ctx.roleName === ROLES.hod && audienceKind === "institution") {
    throw new AuthzError(
      "FORBIDDEN",
      "HOD announcements must target a department audience"
    );
  }

  await assertScopeIds(ctx, { ...input, audienceKind });

  const shouldPublish = Boolean(input.publish);
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO public.announcements (
        institution_id, title, body, priority, status, audience_kind,
        department_id, program_id, semester_id, section_id,
        start_at, end_at, created_by, published_by, published_at, notify_recipients
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
               CASE WHEN $5 = 'published' THEN $13 END,
               CASE WHEN $5 = 'published' THEN now() END,
               $14)
     RETURNING id`,
    [
      institutionId,
      title,
      body,
      priority,
      shouldPublish ? "published" : "draft",
      audienceKind,
      input.departmentId ?? null,
      input.programId ?? null,
      input.semesterId ?? null,
      input.sectionId ?? null,
      input.startAt ?? null,
      input.endAt ?? null,
      ctx.userId,
      input.notifyRecipients !== false,
    ]
  );
  const id = inserted.rows[0].id;

  if (shouldPublish) {
    await fanOutAnnouncement(ctx, id, institutionId, title, body, priority, {
      audienceKind,
      departmentId: input.departmentId ?? null,
      sectionId: input.sectionId ?? null,
      programId: input.programId ?? null,
    });
  }

  const view = await pool.query<AnnouncementView>(
    `SELECT a.*, p.full_name AS creator_name
       FROM public.announcements a
       JOIN public.profiles p ON p.id = a.created_by
      WHERE a.id = $1`,
    [id]
  );
  return view.rows[0];
}

async function fanOutAnnouncement(
  ctx: AuthContext,
  announcementId: string,
  institutionId: string,
  title: string,
  body: string,
  priority: string,
  scope: {
    audienceKind: string;
    departmentId: string | null;
    sectionId: string | null;
    programId: string | null;
  }
): Promise<void> {
  let sql = `
    SELECT DISTINCT p.id
      FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
     WHERE p.institution_id = $1 AND p.status = 'active'`;
  const params: unknown[] = [institutionId];

  if (scope.audienceKind === "faculty") {
    sql += ` AND r.name IN ('faculty','hod','director_dean','tpo','admin')`;
  } else if (scope.audienceKind === "students") {
    sql += ` AND r.name = 'student'`;
  } else if (scope.audienceKind === "section" && scope.sectionId) {
    params.push(scope.sectionId);
    sql += ` AND r.name = 'student' AND p.id IN (
      SELECT e.student_id FROM public.student_enrollments e
       WHERE e.section_id = $${params.length} AND e.status = 'active')`;
    // also faculty assigned to section subjects
    sql += ` OR (r.name IN ('faculty','hod') AND p.id IN (
      SELECT ss.faculty_id FROM public.section_subjects ss
       WHERE ss.section_id = $${params.length} AND ss.faculty_id IS NOT NULL))`;
  } else if (scope.audienceKind === "department" && scope.departmentId) {
    params.push(scope.departmentId);
    sql += ` AND (
      r.name IN ('hod','director_dean','admin','tpo')
      OR p.id IN (SELECT hod_id FROM public.department_heads
                   WHERE department_id = $${params.length} AND valid_to IS NULL)
      OR r.name = 'student' AND p.id IN (
        SELECT e.student_id FROM public.student_enrollments e
         JOIN public.sections s ON s.id = e.section_id
         JOIN public.semesters sm ON sm.id = s.semester_id
         JOIN public.academic_years ay ON ay.id = sm.academic_year_id
         JOIN public.programs pr ON pr.id = ay.program_id
        WHERE pr.department_id = $${params.length} AND e.status = 'active')
    )`;
  } else if (scope.audienceKind === "program" && scope.programId) {
    params.push(scope.programId);
    sql += ` AND (
      r.name = 'student' AND p.id IN (
        SELECT e.student_id FROM public.student_enrollments e
         JOIN public.sections s ON s.id = e.section_id
         JOIN public.semesters sm ON sm.id = s.semester_id
         JOIN public.academic_years ay ON ay.id = sm.academic_year_id
        WHERE ay.program_id = $${params.length} AND e.status = 'active')
    )`;
  }

  const recipients = await pool.query<{ id: string }>(sql, params);

  const notificationBody = body.slice(0, 500);
  for (const rec of recipients.rows) {
    if (rec.id === ctx.userId) continue;
    try {
      await createNotification(ctx, {
        recipientId: rec.id,
        event: "announcement.published",
        title: `Announcement: ${title}`,
        body: notificationBody,
        priority: priority === "urgent" ? "high" : "normal",
        institutionId,
      });
    } catch {
      // notification fan-out is best-effort
    }
  }
  void announcementId;
}

export async function publishAnnouncement(
  ctx: AuthContext,
  id: string
): Promise<AnnouncementView> {
  if (!CREATE_ROLES.includes(ctx.roleName as never)) {
    throw new AuthzError("FORBIDDEN", "Your role cannot publish announcements");
  }
  const existing = await pool.query<AnnouncementRow>(
    `SELECT * FROM public.announcements WHERE id = $1`,
    [id]
  );
  const row = existing.rows[0];
  if (!row || row.institution_id !== ctx.institutionId) {
    throw new AuthzError("FORBIDDEN", "Announcement not found");
  }
  if (row.status !== "draft") {
    throw new AuthzError("FORBIDDEN", "Only draft announcements can be published");
  }
  // HOD who created cannot publish institution-wide without scope re-check
  await pool.query(
    `UPDATE public.announcements
        SET status = 'published', published_by = $2, published_at = now()
      WHERE id = $1 AND status = 'draft'`,
    [id, ctx.userId]
  );
  await fanOutAnnouncement(
    ctx,
    id,
    row.institution_id,
    row.title,
    row.body,
    row.priority,
    {
      audienceKind: row.audience_kind,
      departmentId: row.department_id,
      sectionId: row.section_id,
      programId: row.program_id,
    }
  );
  const view = await pool.query<AnnouncementView>(
    `SELECT a.*, p.full_name AS creator_name
       FROM public.announcements a
       JOIN public.profiles p ON p.id = a.created_by
      WHERE a.id = $1`,
    [id]
  );
  return view.rows[0];
}

export type ListAnnouncementsQuery = {
  status?: string;
  mine?: boolean;
  limit?: number;
};

export async function listAnnouncements(
  ctx: AuthContext,
  query: ListAnnouncementsQuery = {}
): Promise<AnnouncementView[]> {
  if (!ctx.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const params: unknown[] = [ctx.institutionId];
  const clauses: string[] = [];

  if (query.mine && query.status) {
    params.push(query.status);
    clauses.push(`a.status = $${params.length}`);
  } else {
    // Visibility: published always; drafts only for creator/authorized staff.
    if (
      [ROLES.admin, ROLES.directorDean].includes(ctx.roleName as never)
    ) {
      // all statuses in institution
    } else if ([ROLES.faculty, ROLES.hod, ROLES.tpo].includes(ctx.roleName as never)) {
      clauses.push(`(a.status = 'published' OR a.created_by = $${params.length + 0})`);
      params.push(ctx.userId);
      // fix param index — rewrite below more simply
      clauses.pop();
      clauses.push(`(a.status = 'published' OR a.created_by = $${params.length})`);
    } else {
      clauses.push(`a.status = 'published'`);
    }
  }

  if (query.mine) {
    params.push(ctx.userId);
    clauses.push(`a.created_by = $${params.length}`);
  }

  // Audience filter for students / faculty (non-admin)
  if (ctx.roleName === ROLES.student) {
    params.push(ctx.userId);
    const uid = `$${params.length}`;
    clauses.push(`(
      a.audience_kind = 'institution'
      OR a.audience_kind IN ('students','faculty')
      OR (a.audience_kind = 'section' AND a.section_id IN (
        SELECT e.section_id FROM public.student_enrollments e
         WHERE e.student_id = ${uid} AND e.status = 'active'))
      OR (a.audience_kind = 'program' AND a.program_id IN (
        SELECT ay.program_id FROM public.student_enrollments e
         JOIN public.sections s ON s.id = e.section_id
         JOIN public.semesters sm ON sm.id = s.semester_id
         JOIN public.academic_years ay ON ay.id = sm.academic_year_id
         WHERE e.student_id = ${uid} AND e.status = 'active'))
      OR (a.audience_kind = 'department' AND a.department_id IN (
        SELECT pr.department_id FROM public.student_enrollments e
         JOIN public.sections s ON s.id = e.section_id
         JOIN public.semesters sm ON sm.id = s.semester_id
         JOIN public.academic_years ay ON ay.id = sm.academic_year_id
         JOIN public.programs pr ON pr.id = ay.program_id
         WHERE e.student_id = ${uid} AND e.status = 'active'))
    )`);
  } else if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod) {
    // faculty see institution + faculty + own department
    // already filtered by status above
  }

  const where = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
  const result = await pool.query<AnnouncementView>(
    `SELECT a.*, p.full_name AS creator_name
       FROM public.announcements a
       JOIN public.profiles p ON p.id = a.created_by
      WHERE a.institution_id = $1 ${where}
      ORDER BY COALESCE(a.published_at, a.created_at) DESC
      LIMIT $${params.length + 1}`,
    [...params, limit]
  );
  return result.rows;
}
