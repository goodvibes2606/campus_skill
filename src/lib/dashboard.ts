import { pool } from "@/lib/db";
import {
  requireInstitution,
  ROLES,
  type AuthContext,
} from "@/lib/authz";
import { getAcademicScope } from "@/lib/academic-scope";
import { listVisibleAssignments } from "@/lib/assignments";
import { listVisibleResources } from "@/lib/resources";
import { listVisibleSyllabi } from "@/lib/syllabus";
import { listCalendarEvents } from "@/lib/calendar";
import { listNotifications, countUnreadNotifications } from "@/lib/notifications";
import { listMsts } from "@/lib/mst";
import { listQuestionPapers } from "@/lib/question-bank";
import { listDailyWorkReports } from "@/lib/daily-work";
import { prioritizeAcademicNotifications } from "@/lib/student-academics";
import { getPlacementScope } from "@/lib/placement-scope";
import { loadPlacementCounts } from "@/lib/placement-applications";
import { listOpportunities } from "@/lib/placement-opportunities";
import { listApplications } from "@/lib/placement-applications";
import { listPlacementResponsibilities } from "@/lib/placement-appointments";

/**
 * Role-aware dashboard data (Milestone 7).
 *
 * All data is loaded server-side through existing visibility-filtered
 * services (or institution/department-scoped SQL that mirrors those rules).
 * No client-supplied role/scope IDs are trusted. No synthetic statistics —
 * cards show real rows/counts only; empty arrays render empty states.
 */

export type DashboardItem = {
  id: string;
  title: string;
  meta: string;
  badge?: string;
  href?: string;
};

export type DashboardQuickAction = {
  title: string;
  detail: string;
  href: string;
  tone: "blue" | "gold" | "green";
};

export type DashboardStat = {
  label: string;
  value: string;
  hint?: string;
};

export type DashboardSection = {
  key: string;
  title: string;
  eyebrow?: string;
  items: DashboardItem[];
  emptyMessage: string;
  moreHref?: string;
  moreLabel?: string;
};

export type DashboardPayload = {
  roleName: string;
  displayName: string;
  contextLine: string;
  stats: DashboardStat[];
  sections: DashboardSection[];
  quickActions: DashboardActionGroup[];
};

export type DashboardActionGroup = {
  title: string;
  actions: DashboardQuickAction[];
};

function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayKey(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDay(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleWorkspaceLabel(roleName: string): string {
  switch (roleName) {
    case ROLES.student:
      return "Student workspace";
    case ROLES.faculty:
      return "Faculty workspace";
    case ROLES.hod:
      return "HOD workspace";
    case ROLES.directorDean:
      return "Director / Dean workspace";
    case ROLES.admin:
      return "Institution admin";
    case ROLES.systemAdmin:
      return "System administration";
    case ROLES.tpo:
      return "Placement cell";
    default:
      return "Workspace";
  }
}

// ---------------------------------------------------------------------------
// Shared builders
// ---------------------------------------------------------------------------

function stat(
  label: string,
  value: number | string,
  hint?: string
): DashboardStat {
  return { label, value: String(value), hint };
}

function section(
  key: string,
  title: string,
  items: DashboardItem[],
  emptyMessage: string,
  opts: { eyebrow?: string; moreHref?: string; moreLabel?: string } = {}
): DashboardSection {
  return {
    key,
    title,
    eyebrow: opts.eyebrow,
    items,
    emptyMessage,
    moreHref: opts.moreHref,
    moreLabel: opts.moreLabel,
  };
}

async function institutionName(
  institutionId: string | null
): Promise<string | null> {
  if (!institutionId) return null;
  const r = await pool.query<{ name: string }>(
    `SELECT name FROM public.institutions WHERE id = $1`,
    [institutionId]
  );
  return r.rows[0]?.name ?? null;
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

async function loadStudentDashboard(
  ctx: AuthContext
): Promise<DashboardPayload> {
  const scope = await getAcademicScope(ctx);
  const enr = scope.enrollment;

  const today = localToday();
  const [assignments, resources, syllabi, papers, msts, notifications, unread] =
    await Promise.all([
      listVisibleAssignments(ctx, { limit: 8 }),
      listVisibleResources(ctx, { limit: 6, status: "published" }),
      listVisibleSyllabi(ctx, { limit: 6, status: "published" }),
      listQuestionPapers(ctx, { limit: 5, status: "published" }),
      listMsts(ctx, { limit: 5, status: "published" }),
      listNotifications(ctx, { limit: 5 }),
      countUnreadNotifications(ctx),
    ]);

  const todayEvents = await listCalendarEvents(ctx, {
    from: today,
    to: today,
    limit: 10,
  });
  const upcomingEvents = await listCalendarEvents(ctx, {
    from: today,
    limit: 6,
  });

  const subjects = enr
    ? (
        await pool.query<{
          id: string;
          name: string;
          subject_code: string;
          faculty_name: string | null;
        }>(
          `SELECT sub.id, sub.name, sub.subject_code, p.full_name AS faculty_name
             FROM public.section_subjects ss
             JOIN public.subjects sub ON sub.id = ss.subject_id
             LEFT JOIN public.profiles p ON p.id = ss.faculty_id
            WHERE ss.section_id = $1 AND ss.status = 'active'
            ORDER BY sub.subject_code ASC`,
          [enr.section_id]
        )
      ).rows
    : [];

  const pendingSubmissions: DashboardItem[] = enr
    ? (
        await pool.query<{
          id: string;
          status: string;
          title: string;
          due_at: Date | null;
          assignment_id: string;
        }>(
          `SELECT s.id, s.status, s.assignment_id, a.title, a.due_at
             FROM public.assignment_submissions s
             JOIN public.assignments a ON a.id = s.assignment_id
            WHERE s.student_id = $1
              AND s.status IN ('draft', 'returned')
            ORDER BY a.due_at NULLS LAST, s.updated_at DESC
            LIMIT 5`,
          [ctx.userId]
        )
      ).rows.map((row) => ({
          id: row.id,
          title: row.title,
          meta:
            row.status === "returned"
              ? `Returned · revise and resubmit${
                  row.due_at ? ` · due ${formatDay(row.due_at)}` : ""
                }`
              : `Draft${
                  row.due_at ? ` · due ${formatDay(row.due_at)}` : ""
                }`,
          badge: row.status,
          href: "/assignments",
        }))
    : [];

  const missingSubmissions: DashboardItem[] = enr
    ? (
        await pool.query<{
          id: string;
          title: string;
          due_at: Date | null;
        }>(
          `SELECT a.id, a.title, a.due_at
             FROM public.assignments a
            WHERE a.institution_id = $1
              AND a.section_id = $2
              AND a.program_id = $3
              AND a.academic_year_id = $4
              AND a.semester_id = $5
              AND a.status = 'published'
              AND NOT EXISTS (
                SELECT 1 FROM public.assignment_submissions s
                 WHERE s.assignment_id = a.id AND s.student_id = $6
              )
            ORDER BY a.due_at NULLS LAST, a.updated_at DESC
            LIMIT 5`,
          [
            enr.institution_id,
            enr.section_id,
            enr.program_id,
            enr.academic_year_id,
            enr.semester_id,
            ctx.userId,
          ]
        )
      ).rows.map((row) => ({
          id: row.id,
          title: row.title,
          meta: row.due_at
            ? `No submission yet · due ${formatDay(row.due_at)}`
            : "No submission yet",
          badge: "pending",
          href: "/assignments",
        }))
    : [];

  const sections: DashboardSection[] = [];

  if (!enr) {
    sections.push(
      section(
        "enrollment",
        "Enrollment",
        [],
        "No active enrollment yet. Your subjects, assignments, and resources will appear here once you are enrolled in a section.",
        {}
      )
    );
  } else {
    sections.push(
      section(
        "today",
        "Today’s academic activity",
        [
          ...todayEvents.map((e) => ({
            id: e.id,
            title: e.title,
            meta: `${e.event_type} · ${formatDay(e.starts_on)}${
              dayKey(e.starts_on) !== dayKey(e.ends_on)
                ? ` – ${formatDay(e.ends_on)}`
                : ""
            }`,
            badge: e.status,
            href: "/calendar",
          })),
          ...assignments
            .filter((a) => {
              if (!a.due_at) return false;
              const due = (a.due_at instanceof Date
                ? a.due_at
                : new Date(a.due_at)
              )
                .toISOString()
                .slice(0, 10);
              return due <= today;
            })
            .map((a) => ({
              id: `due-${a.id}`,
              title: a.title,
              meta: `Assignment due ${formatDay(a.due_at)} · ${a.subject_name}`,
              badge: a.status,
              href: "/assignments",
            })),
        ],
        "Nothing scheduled for today. Check upcoming calendar dates and assignments below.",
        { eyebrow: formatDay(new Date()) }
      )
    );

    sections.push(
      section(
        "subjects",
        "Enrolled subjects",
        subjects.map((s) => ({
          id: s.id,
          title: `${s.subject_code} · ${s.name}`,
          meta: s.faculty_name ? `Faculty: ${s.faculty_name}` : "No faculty assigned",
          href: `/subjects/${s.id}`,
        })),
        "No subjects linked to your section yet.",
        { moreHref: "/subjects", moreLabel: "Open my subjects" }
      )
    );

    sections.push(
      section(
        "pending",
        "Pending submissions",
        [...pendingSubmissions, ...missingSubmissions],
        "Nothing pending — you are up to date on submissions.",
        { moreHref: "/assignments", moreLabel: "Open assignments" }
      )
    );

    sections.push(
      section(
        "syllabus",
        "Syllabus & topics",
        syllabi.map((s) => ({
          id: s.id,
          title: s.title,
          meta: `${s.subject_code} · ${s.academic_year_name} · v${s.version} · ${s.unit_count} unit${
            s.unit_count === 1 ? "" : "s"
          }`,
          badge: s.status,
          href: "/syllabus",
        })),
        "No published syllabus for your program yet.",
        { moreHref: "/syllabus", moreLabel: "Open syllabus" }
      )
    );

    sections.push(
      section(
        "resources",
        "Academic resources",
        resources.map((r) => ({
          id: r.id,
          title: r.title,
          meta: `${r.resource_type} · ${r.subject_code} · ${r.section_name}`,
          badge: r.status,
          href: "/notes",
        })),
        "No published resources for your section yet.",
        { moreHref: "/notes", moreLabel: "Open notes" }
      )
    );

    sections.push(
      section(
        "assessments",
        "Assignments, papers & MST",
        [
          ...assignments.slice(0, 5).map((a) => ({
            id: a.id,
            title: a.title,
            meta: `Assignment · ${a.subject_code} · ${
              a.due_at ? `due ${formatDay(a.due_at)}` : "no due date"
            }`,
            badge: a.status,
            href: "/assignments",
          })),
          ...papers.slice(0, 3).map((p) => ({
            id: p.id,
            title: p.title,
            meta: `Question paper · ${p.subject_code} · ${p.total_marks} marks`,
            badge: p.status,
            href: "/assignments",
          })),
          ...msts.slice(0, 3).map((m) => ({
            id: m.id,
            title: `MST-${m.mst_number}: ${m.title}`,
            meta: `MST · ${m.subject_code} · ${
              m.scheduled_on ? `scheduled ${formatDay(m.scheduled_on)}` : "no date"
            }`,
            badge: m.status,
            href: "/assignments",
          })),
        ],
        "No visible assessments yet.",
        { moreHref: "/assignments", moreLabel: "Open assessments" }
      )
    );
  }

  sections.push(
    section(
      "calendar",
      "Calendar",
      (todayEvents.length > 0
        ? todayEvents
        : upcomingEvents
      ).slice(0, 6).map((e) => ({
        id: e.id,
        title: e.title,
        meta: `${formatDay(e.starts_on)}${
          dayKey(e.starts_on) !== dayKey(e.ends_on)
            ? ` – ${formatDay(e.ends_on)}`
            : ""
        } · ${e.event_type}`,
        badge: e.status,
        href: "/calendar",
      })),
      "No published calendar events yet.",
      { moreHref: "/calendar", moreLabel: "Open calendar" }
    )
  );

  sections.push(
    section(
      "notifications",
      "Notifications",
      prioritizeAcademicNotifications(notifications)
        .slice(0, 5)
        .map((n) => ({
          id: n.id,
          title: n.title,
          meta: `${n.is_read ? "Read" : "Unread"} · ${formatDateTime(n.created_at)}`,
          badge: n.priority,
          href: "/notifications",
        })),
      "No notifications yet.",
      { moreHref: "/notifications", moreLabel: "Open notifications" }
    )
  );

  const contextLine = enr
    ? `${enr.program_name} · ${enr.section_name} · Sem ${enr.semester_number} · ${enr.academic_year_name}`
    : "No active enrollment — institutional content will appear once assigned.";

  return {
    roleName: ctx.roleName,
    displayName: ctx.fullName || ctx.email,
    contextLine,
    stats: [
      stat("Subjects", subjects.length),
      stat("Assignments visible", assignments.length),
      stat("Unread notifications", unread),
      stat("Today’s events", todayEvents.length),
    ],
    sections,
    quickActions: [
      {
        title: "Quick access",
        actions: [
          {
            title: "My subjects",
            detail: "Subject workspaces for your section",
            href: "/subjects",
            tone: "green",
          },
          {
            title: "Assignments",
            detail: "Work, papers, and MSTs",
            href: "/assignments",
            tone: "gold",
          },
          {
            title: "Notes & resources",
            detail: "Study materials for your section",
            href: "/notes",
            tone: "blue",
          },
          {
            title: "Syllabus",
            detail: "Units and topics",
            href: "/syllabus",
            tone: "green",
          },
          {
            title: "Calendar",
            detail: "Dates and deadlines",
            href: "/calendar",
            tone: "blue",
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Faculty
// ---------------------------------------------------------------------------

async function loadFacultyDashboard(
  ctx: AuthContext
): Promise<DashboardPayload> {
  const scope = await getAcademicScope(ctx);
  const today = localToday();

  const [
    assignments,
    resources,
    syllabi,
    papers,
    msts,
    notifications,
    unread,
    ownDailyWork,
  ] = await Promise.all([
    listVisibleAssignments(ctx, { limit: 8 }),
    listVisibleResources(ctx, { limit: 6 }),
    listVisibleSyllabi(ctx, { limit: 6 }),
    listQuestionPapers(ctx, { limit: 6 }),
    listMsts(ctx, { limit: 6 }),
    listNotifications(ctx, { limit: 5 }),
    countUnreadNotifications(ctx),
    listDailyWorkReports(ctx, { date: today, reporterId: ctx.userId, limit: 5 }),
  ]);

  const todayEvents = await listCalendarEvents(ctx, {
    from: today,
    to: today,
    limit: 10,
  });
  const upcomingEvents = await listCalendarEvents(ctx, { from: today, limit: 6 });

  const activeAssignments = scope.facultyAssignments.filter(
    (a) => a.status === "active"
  );

  const reviewQueue: DashboardItem[] = (
    await pool.query<{
      id: string;
      status: string;
      title: string;
      assignment_id: string;
      student_name: string;
      submitted_at: Date | null;
    }>(
      `SELECT s.id, s.status, s.assignment_id, s.student_name, s.submitted_at, a.title
         FROM (
           SELECT s.id, s.status, s.assignment_id, s.student_id, s.submitted_at,
                  p.full_name AS student_name
             FROM public.assignment_submissions s
             JOIN public.profiles p ON p.id = s.student_id
            WHERE s.status = 'submitted'
         ) s
         JOIN public.assignments a ON a.id = s.assignment_id
        WHERE (
                a.owner_id = $1
             OR a.created_by = $1
             OR EXISTS (
                   SELECT 1 FROM public.faculty_assignments fa
                    WHERE fa.faculty_id = $1
                      AND fa.status = 'active'
                      AND fa.section_id = a.section_id
                      AND fa.subject_id = a.subject_id
                )
             OR a.department_id = ANY($2::uuid[])
              )
        ORDER BY s.submitted_at ASC NULLS LAST
        LIMIT 6`,
      [
        ctx.userId,
        scope.headships
          .filter((h) => h.status === "ACTIVE" && h.status !== undefined)
          .map((h) => h.department_id),
      ]
    )
  ).rows.map((row) => ({
    id: row.id,
    title: `${row.student_name} · ${row.title}`,
    meta: `Awaiting review · submitted ${
      row.submitted_at ? formatDateTime(row.submitted_at) : "recently"
    }`,
    badge: row.status,
    href: "/assignments",
  }));

  const sections: DashboardSection[] = [
    section(
      "today",
      "Today’s classes & work",
      [
        ...todayEvents.map((e) => ({
          id: e.id,
          title: e.title,
          meta: `${e.event_type} · ${formatDay(e.starts_on)}`,
          badge: e.status,
          href: "/calendar",
        })),
        ...ownDailyWork.map((r) => ({
          id: r.id,
          title: r.summary || "Daily work report",
          meta: `Daily work · ${String(r.report_date).slice(0, 10)} · ${r.status}`,
          badge: r.status,
          href: "/daily-work",
        })),
        ...reviewQueue.slice(0, 3),
      ],
      "Nothing scheduled for today yet. File daily work or review pending submissions below.",
      { eyebrow: formatDay(new Date()) }
    ),
    section(
      "assignments-teaching",
      "Assigned subjects & classes",
      activeAssignments.map((a) => ({
        id: a.id,
        title: `${a.subject_code} · ${a.subject_name}`,
        meta: `${a.section_name} · ${a.program_code} · Sem ${a.semester_number} · ${a.academic_year_name}`,
        badge: "active",
      })),
      "No active teaching assignments yet.",
      {}
    ),
    section(
      "review",
      "Submissions awaiting review",
      reviewQueue,
      "No submissions waiting for review.",
      { moreHref: "/assignments", moreLabel: "Open assignments" }
    ),
    section(
      "resources",
      "Resources",
      resources.slice(0, 6).map((r) => ({
        id: r.id,
        title: r.title,
        meta: `${r.resource_type} · ${r.subject_code} · ${r.section_name}`,
        badge: r.status,
        href: "/notes",
      })),
      "No resources in your scope yet.",
      { moreHref: "/notes", moreLabel: "Open notes" }
    ),
    section(
      "syllabus",
      "Syllabus",
      syllabi.slice(0, 6).map((s) => ({
        id: s.id,
        title: s.title,
        meta: `${s.subject_code} · ${s.academic_year_name} · v${s.version} · ${
          s.status
        }`,
        badge: s.status,
        href: "/syllabus",
      })),
      "No syllabi in your scope yet.",
      { moreHref: "/syllabus", moreLabel: "Open syllabus" }
    ),
    section(
      "assessments",
      "Assignments, papers & MST work",
      [
        ...assignments.slice(0, 4).map((a) => ({
          id: a.id,
          title: a.title,
          meta: `Assignment · ${a.subject_code} · ${a.section_name} · ${
            a.submission_count
          } submission${a.submission_count === 1 ? "" : "s"}`,
          badge: a.status,
          href: "/assignments",
        })),
        ...papers.slice(0, 3).map((p) => ({
          id: p.id,
          title: p.title,
          meta: `Paper · ${p.subject_code} · ${p.total_marks} marks`,
          badge: p.status,
          href: "/assignments",
        })),
        ...msts.slice(0, 3).map((m) => ({
          id: m.id,
          title: `MST-${m.mst_number}: ${m.title}`,
          meta: `MST · ${m.subject_code} · ${
            m.scheduled_on ? formatDay(m.scheduled_on) : "no date"
          }`,
          badge: m.status,
          href: "/assignments",
        })),
      ],
      "No assessment work in your scope yet.",
      { moreHref: "/assignments", moreLabel: "Open assessments" }
    ),
    section(
      "daily-work",
      "Daily work",
      ownDailyWork.map((r) => ({
        id: r.id,
        title: r.summary || "Daily work report",
        meta: `${String(r.report_date).slice(0, 10)} · ${r.status}${
          r.return_note ? ` · ${r.return_note}` : ""
        }`,
        badge: r.status,
        href: "/daily-work",
      })),
      "No daily work report for today yet.",
      { moreHref: "/daily-work", moreLabel: "Open daily work" }
    ),
    section(
      "calendar",
      "Calendar",
      upcomingEvents.slice(0, 6).map((e) => ({
        id: e.id,
        title: e.title,
        meta: `${formatDay(e.starts_on)} · ${e.event_type}`,
        badge: e.status,
        href: "/calendar",
      })),
      "No upcoming calendar events visible to you.",
      { moreHref: "/calendar", moreLabel: "Open calendar" }
    ),
    section(
      "notifications",
      "Notifications",
      notifications.map((n) => ({
        id: n.id,
        title: n.title,
        meta: `${n.is_read ? "Read" : "Unread"} · ${formatDateTime(n.created_at)}`,
        badge: n.priority,
        href: "/notifications",
      })),
      "No notifications yet.",
      { moreHref: "/notifications", moreLabel: "Open notifications" }
    ),
  ];

  const contextLine = activeAssignments.length
    ? `${activeAssignments.length} active assignment${
        activeAssignments.length === 1 ? "" : "s"
      } · ${scope.coordinatorSections.filter((c) => c.status === "ACTIVE").length} coordinator role(s)`
    : "No active teaching assignments yet.";

  return {
    roleName: ctx.roleName,
    displayName: ctx.fullName || ctx.email,
    contextLine,
    stats: [
      stat("Teaching assignments", activeAssignments.length),
      stat("Awaiting review", reviewQueue.length),
      stat("Unread notifications", unread),
      stat("Today’s events", todayEvents.length),
    ],
    sections,
    quickActions: [
      {
        title: "Quick access",
        actions: [
          {
            title: "Daily work",
            detail: "File today’s report",
            href: "/daily-work",
            tone: "green",
          },
          {
            title: "Assignments",
            detail: "Create and review work",
            href: "/assignments",
            tone: "gold",
          },
          {
            title: "Notes & resources",
            detail: "Share study materials",
            href: "/notes",
            tone: "blue",
          },
          {
            title: "Syllabus",
            detail: "Units, topics, versions",
            href: "/syllabus",
            tone: "green",
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// HOD
// ---------------------------------------------------------------------------

async function loadHodDashboard(ctx: AuthContext): Promise<DashboardPayload> {
  const scope = await getAcademicScope(ctx);
  const today = localToday();
  const deptIds = scope.headships
    .filter((h) => h.status === "ACTIVE" && h.valid_to === null)
    .map((h) => h.department_id);

  const [notifications, unread, calendarPending, dailyWorkSubmitted] =
    await Promise.all([
      listNotifications(ctx, { limit: 5 }),
      countUnreadNotifications(ctx),
      listCalendarEvents(ctx, { status: "pending_approval", limit: 10 }),
      listDailyWorkReports(ctx, { status: "submitted", limit: 8 }),
    ]);

  const upcomingEvents = await listCalendarEvents(ctx, { from: today, limit: 6 });

  const facultyOverview =
    deptIds.length > 0
      ? (
          await pool.query<{
            id: string;
            full_name: string;
            email: string;
            subject_name: string | null;
            section_name: string | null;
          }>(
            `SELECT DISTINCT p.id, p.full_name, p.email,
                    sub.name AS subject_name, sec.name AS section_name
               FROM public.faculty_assignments fa
               JOIN public.profiles p ON p.id = fa.faculty_id AND p.status = 'active'
               LEFT JOIN public.subjects sub ON sub.id = fa.subject_id
               LEFT JOIN public.sections sec ON sec.id = fa.section_id
              WHERE fa.status = 'active'
                AND fa.department_id = ANY($1::uuid[])
              ORDER BY p.full_name ASC
              LIMIT 12`,
            [deptIds]
          )
        ).rows
      : [];

  const departmentStudents =
    deptIds.length > 0
      ? (
          await pool.query<{ count: string }>(
            `SELECT count(DISTINCT e.student_id)::text AS count
               FROM public.student_enrollments e
               JOIN public.sections sec ON sec.id = e.section_id
               JOIN public.semesters sm ON sm.id = sec.semester_id
               JOIN public.academic_years ay ON ay.id = sm.academic_year_id
               JOIN public.programs pr ON pr.id = ay.program_id
              WHERE e.status = 'active'
                AND pr.department_id = ANY($1::uuid[])`,
            [deptIds]
          )
        ).rows[0]
      : undefined;

  const pendingSyllabi =
    deptIds.length > 0
      ? (
          await pool.query<{
            id: string;
            title: string;
            status: string;
            subject_code: string;
            submitted_at: Date | null;
          }>(
            `SELECT y.id, y.title, y.status, sub.subject_code, y.submitted_at
               FROM public.syllabi y
               JOIN public.subjects sub ON sub.id = y.subject_id
              WHERE y.status = 'in_review'
                AND y.department_id = ANY($1::uuid[])
              ORDER BY y.submitted_at ASC NULLS LAST
              LIMIT 6`,
            [deptIds]
          )
        ).rows.map((row) => ({
            id: row.id,
            title: row.title,
            meta: `Syllabus · ${row.subject_code} · submitted ${
              row.submitted_at ? formatDateTime(row.submitted_at) : "recently"
            }`,
            badge: row.status,
            href: "/syllabus",
          }))
      : [];

  const pendingPapers =
    deptIds.length > 0
      ? (
          await pool.query<{
            id: string;
            title: string;
            status: string;
            subject_code: string;
          }>(
            `SELECT p.id, p.title, p.status, sub.subject_code
               FROM public.question_papers p
               JOIN public.subjects sub ON sub.id = p.subject_id
              WHERE p.status = 'in_review'
                AND p.department_id = ANY($1::uuid[])
              ORDER BY p.updated_at DESC
              LIMIT 6`,
            [deptIds]
          )
        ).rows.map((row) => ({
            id: row.id,
            title: row.title,
            meta: `Question paper · ${row.subject_code}`,
            badge: row.status,
            href: "/assignments",
          }))
      : [];

  const pendingMsts =
    deptIds.length > 0
      ? (
          await pool.query<{
            id: string;
            title: string;
            status: string;
            subject_code: string;
            mst_number: number;
          }>(
            `SELECT m.id, m.title, m.status, sub.subject_code, m.mst_number
               FROM public.mid_semester_tests m
               JOIN public.subjects sub ON sub.id = m.subject_id
              WHERE m.status = 'in_review'
                AND m.department_id = ANY($1::uuid[])
              ORDER BY m.updated_at DESC
              LIMIT 6`,
            [deptIds]
          )
        ).rows.map((row) => ({
            id: row.id,
            title: `MST-${row.mst_number}: ${row.title}`,
            meta: `Mid-semester test · ${row.subject_code}`,
            badge: row.status,
            href: "/assignments",
          }))
      : [];

  const hodDailyWorkPending = dailyWorkSubmitted.filter(
    (r) =>
      r.reporter_id === ctx.userId ||
      (r.department_id ? deptIds.includes(r.department_id) : false)
  );

  const approvals: DashboardItem[] = [
    ...pendingSyllabi,
    ...calendarPending
      .filter(
        (e) =>
          e.department_id === null ||
          (e.department_id && deptIds.includes(e.department_id))
      )
      .map((e) => ({
        id: e.id,
        title: e.title,
        meta: `Calendar · ${formatDay(e.starts_on)} · awaiting approval`,
        badge: e.status,
        href: "/calendar",
      })),
    ...pendingPapers,
    ...pendingMsts,
    ...hodDailyWorkPending.map((r) => ({
      id: r.id,
      title: r.summary || "Daily work report",
      meta: `Daily work · ${r.reporter_name} · ${String(r.report_date).slice(0, 10)}`,
      badge: r.status,
      href: "/daily-work",
    })),
  ].slice(0, 10);

  const [assignments, resources, msts, papers] = await Promise.all([
    listVisibleAssignments(ctx, { limit: 6 }),
    listVisibleResources(ctx, { limit: 6 }),
    listMsts(ctx, { limit: 6 }),
    listQuestionPapers(ctx, { limit: 6 }),
  ]);

  const departmentNames = scope.headships
    .filter((h) => h.status === "ACTIVE" && h.valid_to === null)
    .map((h) => `${h.department_code} · ${h.department_name}`);

  const sections: DashboardSection[] = [
    section(
      "department",
      "Department overview",
      departmentNames.length
        ? departmentNames.map((name, i) => ({
            id: `dept-${i}`,
            title: name,
            meta: `Active headship${
              departmentStudents
                ? ` · ${Number(departmentStudents.count)} active student enrollment(s)`
                : ""
            }`,
            badge: "ACTIVE",
          }))
        : [],
      "No active department headship on your profile.",
      {}
    ),
    section(
      "faculty",
      "Faculty overview",
      facultyOverview.map((f) => ({
        id: f.id,
        title: f.full_name,
        meta: f.subject_name
          ? `${f.subject_name}${f.section_name ? ` · ${f.section_name}` : ""}`
          : f.email,
        badge: "faculty",
      })),
      "No active faculty assignments in your headed department(s).",
      {}
    ),
    section(
      "approvals",
      "Academic approvals & reviews",
      approvals,
      "Nothing awaiting your approval right now.",
      {}
    ),
    section(
      "daily-work",
      "Faculty daily work",
      hodDailyWorkPending.map((r) => ({
        id: r.id,
        title: r.summary || "Daily work report",
        meta: `${r.reporter_name} · ${String(r.report_date).slice(0, 10)} · ${r.status}`,
        badge: r.status,
        href: "/daily-work",
      })),
      "No submitted daily work awaiting acknowledgement.",
      { moreHref: "/daily-work", moreLabel: "Open daily work" }
    ),
    section(
      "assessments",
      "Assessments",
      [
        ...assignments.slice(0, 4).map((a) => ({
          id: a.id,
          title: a.title,
          meta: `Assignment · ${a.subject_code} · ${a.section_name}`,
          badge: a.status,
          href: "/assignments",
        })),
        ...papers.slice(0, 3).map((p) => ({
          id: p.id,
          title: p.title,
          meta: `Paper · ${p.subject_code}`,
          badge: p.status,
          href: "/assignments",
        })),
        ...msts.slice(0, 3).map((m) => ({
          id: m.id,
          title: `MST-${m.mst_number}: ${m.title}`,
          meta: `MST · ${m.subject_code}`,
          badge: m.status,
          href: "/assignments",
        })),
      ],
      "No assessments visible in your department scope.",
      { moreHref: "/assignments", moreLabel: "Open assessments" }
    ),
    section(
      "resources",
      "Resources",
      resources.slice(0, 6).map((r) => ({
        id: r.id,
        title: r.title,
        meta: `${r.resource_type} · ${r.subject_code}`,
        badge: r.status,
        href: "/notes",
      })),
      "No resources in your department scope.",
      { moreHref: "/notes", moreLabel: "Open notes" }
    ),
    section(
      "calendar",
      "Calendar",
      upcomingEvents.slice(0, 6).map((e) => ({
        id: e.id,
        title: e.title,
        meta: `${formatDay(e.starts_on)} · ${e.event_type}`,
        badge: e.status,
        href: "/calendar",
      })),
      "No upcoming calendar events visible to you.",
      { moreHref: "/calendar", moreLabel: "Open calendar" }
    ),
    section(
      "notifications",
      "Notifications",
      notifications.map((n) => ({
        id: n.id,
        title: n.title,
        meta: `${n.is_read ? "Read" : "Unread"} · ${formatDateTime(n.created_at)}`,
        badge: n.priority,
        href: "/notifications",
      })),
      "No notifications yet.",
      { moreHref: "/notifications", moreLabel: "Open notifications" }
    ),
  ];

  return {
    roleName: ctx.roleName,
    displayName: ctx.fullName || ctx.email,
    contextLine: departmentNames.length
      ? `Heads: ${departmentNames.join(" · ")}`
      : "No active headship assigned.",
    stats: [
      stat("Departments headed", deptIds.length),
      stat("Faculty in scope", facultyOverview.length),
      stat("Pending approvals", approvals.length),
      stat("Unread notifications", unread),
    ],
    sections,
    quickActions: [
      {
        title: "Quick access",
        actions: [
          {
            title: "Daily work",
            detail: "Acknowledge faculty reports",
            href: "/daily-work",
            tone: "green",
          },
          {
            title: "Syllabus",
            detail: "Review department syllabi",
            href: "/syllabus",
            tone: "blue",
          },
          {
            title: "Assignments",
            detail: "Papers, MST, and coursework",
            href: "/assignments",
            tone: "gold",
          },
          {
            title: "Calendar",
            detail: "Approve and circulate dates",
            href: "/calendar",
            tone: "blue",
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Director / Dean + Institution Admin
// ---------------------------------------------------------------------------

async function loadInstitutionLeaderDashboard(
  ctx: AuthContext,
  kind: "director_dean" | "admin"
): Promise<DashboardPayload> {
  const institutionId = requireInstitution(ctx);
  const today = localToday();
  const instName = await institutionName(institutionId);

  const [notifications, unread, calendarPending, dailyWorkSubmitted] =
    await Promise.all([
      listNotifications(ctx, { limit: 5 }),
      countUnreadNotifications(ctx),
      listCalendarEvents(ctx, { status: "pending_approval", limit: 10 }),
      listDailyWorkReports(ctx, { status: "submitted", limit: 8 }),
    ]);

  const upcomingEvents = await listCalendarEvents(ctx, { from: today, limit: 6 });

  const overview = (
    await pool.query<{
      departments: string;
      programs: string;
      faculty: string;
      students: string;
      active_hods: string;
    }>(
      `SELECT
         (SELECT count(*) FROM public.departments
           WHERE institution_id = $1 AND status = 'active')::text AS departments,
         (SELECT count(*) FROM public.programs
           WHERE institution_id = $1 AND status = 'active')::text AS programs,
         (SELECT count(*) FROM public.profiles p
           JOIN public.roles r ON r.id = p.role_id
          WHERE p.institution_id = $1 AND p.status = 'active'
            AND r.name = 'faculty')::text AS faculty,
         (SELECT count(*) FROM public.profiles p
           JOIN public.roles r ON r.id = p.role_id
          WHERE p.institution_id = $1 AND p.status = 'active'
            AND r.name = 'student')::text AS students,
         (SELECT count(*) FROM public.department_heads
           WHERE institution_id = $1 AND valid_to IS NULL)::text AS active_hods`,
      [institutionId]
    )
  ).rows[0];

  const pendingSyllabi = (
    await pool.query<{
      id: string;
      title: string;
      status: string;
      subject_code: string;
      submitted_at: Date | null;
    }>(
      `SELECT y.id, y.title, y.status, sub.subject_code, y.submitted_at
         FROM public.syllabi y
         JOIN public.subjects sub ON sub.id = y.subject_id
        WHERE y.institution_id = $1 AND y.status = 'in_review'
        ORDER BY y.submitted_at ASC NULLS LAST
        LIMIT 6`,
      [institutionId]
    )
  ).rows.map((row) => ({
    id: row.id,
    title: row.title,
    meta: `Syllabus · ${row.subject_code} · submitted ${
      row.submitted_at ? formatDateTime(row.submitted_at) : "recently"
    }`,
    badge: row.status,
    href: "/syllabus",
  }));

  const pendingPapers = (
    await pool.query<{
      id: string;
      title: string;
      status: string;
      subject_code: string;
    }>(
      `SELECT p.id, p.title, p.status, sub.subject_code
         FROM public.question_papers p
         JOIN public.subjects sub ON sub.id = p.subject_id
        WHERE p.institution_id = $1 AND p.status = 'in_review'
        ORDER BY p.updated_at DESC
        LIMIT 6`,
      [institutionId]
    )
  ).rows.map((row) => ({
    id: row.id,
    title: row.title,
    meta: `Question paper · ${row.subject_code}`,
    badge: row.status,
    href: "/assignments",
  }));

  const pendingMsts = (
    await pool.query<{
      id: string;
      title: string;
      status: string;
      subject_code: string;
      mst_number: number;
    }>(
      `SELECT m.id, m.title, m.status, sub.subject_code, m.mst_number
         FROM public.mid_semester_tests m
         JOIN public.subjects sub ON sub.id = m.subject_id
        WHERE m.institution_id = $1 AND m.status = 'in_review'
        ORDER BY m.updated_at DESC
        LIMIT 6`,
      [institutionId]
    )
  ).rows.map((row) => ({
    id: row.id,
    title: `MST-${row.mst_number}: ${row.title}`,
    meta: `Mid-semester test · ${row.subject_code}`,
    badge: row.status,
    href: "/assignments",
  }));

  const hodSummary = (
    await pool.query<{
      department_name: string;
      department_code: string;
      hod_name: string;
    }>(
      `SELECT d.name AS department_name, d.code AS department_code,
              p.full_name AS hod_name
         FROM public.department_heads dh
         JOIN public.departments d ON d.id = dh.department_id
         JOIN public.profiles p ON p.id = dh.hod_id
        WHERE dh.institution_id = $1 AND dh.valid_to IS NULL
        ORDER BY d.code ASC`,
      [institutionId]
    )
  ).rows;

  const approvals: DashboardItem[] = [
    ...pendingSyllabi,
    ...calendarPending
      .filter((e) => e.institution_id === institutionId)
      .map((e) => ({
        id: e.id,
        title: e.title,
        meta: `Calendar · ${formatDay(e.starts_on)} · awaiting approval`,
        badge: e.status,
        href: "/calendar",
      })),
    ...pendingPapers,
    ...pendingMsts,
    ...dailyWorkSubmitted
      .filter((r) => r.institution_id === institutionId)
      .map((r) => ({
        id: r.id,
        title: r.summary || "Daily work report",
        meta: `Daily work · ${r.reporter_name} · ${String(r.report_date).slice(0, 10)}`,
        badge: r.status,
        href: "/daily-work",
      })),
  ].slice(0, 10);

  const sections: DashboardSection[] = [
    section(
      "institution",
      kind === "director_dean"
        ? "Institution overview"
        : "Institution administration",
      overview
        ? [
            {
              id: "departments",
              title: "Departments",
              meta: "Active departments",
              badge: overview.departments,
            },
            {
              id: "programs",
              title: "Programs",
              meta: "Active programs",
              badge: overview.programs,
            },
            {
              id: "faculty",
              title: "Faculty",
              meta: "Active faculty profiles",
              badge: overview.faculty,
            },
            {
              id: "students",
              title: "Students",
              meta: "Active student profiles",
              badge: overview.students,
            },
            {
              id: "hods",
              title: "Active HODs",
              meta: "Current department heads",
              badge: overview.active_hods,
            },
          ]
        : [],
      "Institution metrics unavailable (no institution scope).",
      {}
    ),
    section(
      "approvals",
      "Pending institutional approvals",
      approvals,
      "Nothing awaiting institutional approval.",
      {}
    ),
    section(
      "leaders",
      "Faculty / HOD summaries",
      hodSummary.map((h) => ({
        id: `${h.department_code}`,
        title: h.hod_name,
        meta: `${h.department_code} · ${h.department_name}`,
        badge: "HOD",
      })),
      "No active department heads recorded.",
      {}
    ),
    section(
      "official",
      "Official institutional information",
      [
        {
          id: "institution-name",
          title: instName || "Institution",
          meta: "Registered institution on this platform",
          badge: "official",
        },
        ...upcomingEvents
          .filter((e) => e.status === "published")
          .slice(0, 4)
          .map((e) => ({
            id: e.id,
            title: e.title,
            meta: `Published calendar · ${formatDay(e.starts_on)} · ${e.event_type}`,
            badge: e.status,
            href: "/calendar",
          })),
      ],
      "No published institutional information yet.",
      { moreHref: "/calendar", moreLabel: "Open calendar" }
    ),
    section(
      "calendar",
      "Calendar",
      upcomingEvents.slice(0, 6).map((e) => ({
        id: e.id,
        title: e.title,
        meta: `${formatDay(e.starts_on)} · ${e.event_type}`,
        badge: e.status,
        href: "/calendar",
      })),
      "No upcoming calendar events.",
      { moreHref: "/calendar", moreLabel: "Open calendar" }
    ),
    section(
      "notifications",
      "Notifications",
      notifications.map((n) => ({
        id: n.id,
        title: n.title,
        meta: `${n.is_read ? "Read" : "Unread"} · ${formatDateTime(n.created_at)}`,
        badge: n.priority,
        href: "/notifications",
      })),
      "No notifications yet.",
      { moreHref: "/notifications", moreLabel: "Open notifications" }
    ),
  ];

  return {
    roleName: ctx.roleName,
    displayName: ctx.fullName || ctx.email,
    contextLine: instName
      ? `${instName} · ${roleWorkspaceLabel(ctx.roleName)}`
      : roleWorkspaceLabel(ctx.roleName),
    stats: [
      stat("Departments", overview ? Number(overview.departments) : 0),
      stat("Faculty", overview ? Number(overview.faculty) : 0),
      stat("Students", overview ? Number(overview.students) : 0),
      stat("Pending approvals", approvals.length),
      stat("Unread notifications", unread),
    ],
    sections,
    quickActions: [
      {
        title: "Quick access",
        actions: [
          {
            title: "Calendar",
            detail: "Institutional dates",
            href: "/calendar",
            tone: "blue",
          },
          {
            title: "Syllabus",
            detail: "Program syllabus review",
            href: "/syllabus",
            tone: "green",
          },
          {
            title: "Daily work",
            detail: "Faculty reporting",
            href: "/daily-work",
            tone: "gold",
          },
          {
            title: "Notifications",
            detail: "Institution updates",
            href: "/notifications",
            tone: "blue",
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// System Admin — technical / institutional administration only.
// Deliberately does NOT surface academic approval queues (M7 rule 6).
// ---------------------------------------------------------------------------

async function loadSystemAdminDashboard(
  ctx: AuthContext
): Promise<DashboardPayload> {
  const [notifications, unread] = await Promise.all([
    listNotifications(ctx, { limit: 5 }),
    countUnreadNotifications(ctx),
  ]);

  const instName = await institutionName(ctx.institutionId);

  const sections: DashboardSection[] = [
    section(
      "technical",
      "Technical administration",
      [
        {
          id: "profile",
          title: ctx.fullName || ctx.email,
          meta: `Profile status: ${ctx.profileStatus}`,
          badge: "system_admin",
        },
        {
          id: "institution",
          title: instName || "No institution assigned",
          meta: ctx.institutionId
            ? "Cross-institution operator access is available to system_admin by design"
            : "Assign an institution profile for institution-scoped operations",
          badge: ctx.institutionId ? "assigned" : "pending",
        },
        {
          id: "separation",
          title: "Academic authority is separate",
          meta: "System administration does not grant HOD or Director academic approval powers in this dashboard",
          badge: "info",
        },
      ],
      "No technical status available.",
      {}
    ),
    section(
      "notifications",
      "Notifications",
      notifications.map((n) => ({
        id: n.id,
        title: n.title,
        meta: `${n.is_read ? "Read" : "Unread"} · ${formatDateTime(n.created_at)}`,
        badge: n.priority,
        href: "/notifications",
      })),
      "No notifications yet.",
      { moreHref: "/notifications", moreLabel: "Open notifications" }
    ),
  ];

  return {
    roleName: ctx.roleName,
    displayName: ctx.fullName || ctx.email,
    contextLine:
      "Technical & institutional administration — separate from academic authority",
    stats: [
      stat("Unread notifications", unread),
      stat("Institution scope", ctx.institutionId ? "Assigned" : "None"),
    ],
    sections,
    quickActions: [
      {
        title: "Quick access",
        actions: [
          {
            title: "Notifications",
            detail: "System messages",
            href: "/notifications",
            tone: "blue",
          },
          {
            title: "Profile",
            detail: "Account status",
            href: "/profile",
            tone: "green",
          },
          {
            title: "Calendar",
            detail: "Institutional calendar visibility",
            href: "/calendar",
            tone: "gold",
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// TPO — operational placement owner (Milestone 9)
// ---------------------------------------------------------------------------

async function loadTpoDashboard(ctx: AuthContext): Promise<DashboardPayload> {
  const [notifications, unread, counts, opportunities, applications, appointments] =
    await Promise.all([
      listNotifications(ctx, { limit: 5 }),
      countUnreadNotifications(ctx),
      loadPlacementCounts(ctx),
      listOpportunities(ctx, { limit: 6 }),
      listApplications(ctx, { limit: 6 }),
      listPlacementResponsibilities(ctx, { limit: 5 }),
    ]);

  const sections: DashboardSection[] = [
    section(
      "placement-queue",
      "Placement work queue",
      [
        ...opportunities
          .filter((o) => o.status === "pending_approval" || o.status === "approved" || o.status === "draft")
          .slice(0, 5)
          .map((o) => ({
            id: o.id,
            title: o.title,
            meta: `${o.company_name} · ${o.opportunity_kind} · ${o.application_count} application(s)`,
            badge: o.status,
            href: `/placement/opportunities/${o.id}`,
          })),
        ...applications
          .filter((a) =>
            ["submitted", "screening", "shortlisted", "interview", "selected"].includes(
              a.status
            )
          )
          .slice(0, 5)
          .map((a) => ({
            id: a.id,
            title: `${a.student_name} · ${a.opportunity_title}`,
            meta: `Application · ${a.company_name}`,
            badge: a.status,
            href: `/placement/applications/${a.id}`,
          })),
      ],
      "No open placement work right now.",
      { moreHref: "/placement", moreLabel: "Open placement hub" }
    ),
    section(
      "opportunities",
      "Opportunities",
      opportunities.map((o) => ({
        id: o.id,
        title: o.title,
        meta: `${o.company_name} · ${o.application_count} application(s)`,
        badge: o.status,
        href: `/placement/opportunities/${o.id}`,
      })),
      "No opportunities yet — create a company, then an opportunity.",
      { moreHref: "/placement/opportunities", moreLabel: "Open opportunities" }
    ),
    section(
      "applications",
      "Applications",
      applications.map((a) => ({
        id: a.id,
        title: a.opportunity_title,
        meta: `${a.student_name} · ${a.company_name}`,
        badge: a.status,
        href: `/placement/applications/${a.id}`,
      })),
      "No applications yet.",
      { moreHref: "/placement/applications", moreLabel: "Open applications" }
    ),
    section(
      "appointments",
      "Placement appointments",
      appointments.map((r) => ({
        id: r.id,
        title: `${r.person_name} · ${r.responsibility_title}`,
        meta: `${r.responsibility} · ${r.status}`,
        badge: r.status,
        href: "/placement/appointments",
      })),
      "No placement appointment history yet.",
      { moreHref: "/placement/appointments", moreLabel: "Open appointments" }
    ),
    section(
      "notifications",
      "Notifications",
      notifications.map((n) => ({
        id: n.id,
        title: n.title,
        meta: `${n.is_read ? "Read" : "Unread"} · ${formatDateTime(n.created_at)}`,
        badge: n.priority,
        href: "/notifications",
      })),
      "No notifications yet.",
      { moreHref: "/notifications", moreLabel: "Open notifications" }
    ),
  ];

  const scope = await getPlacementScope(ctx);
  const contextLine = scope.isTpo
    ? "Training & Placement Officer — institution-wide placement operations"
    : scope.isPlacementFaculty
      ? "Placement faculty — department-scoped operations"
      : "Placement operations";

  return {
    roleName: ctx.roleName,
    displayName: ctx.fullName || ctx.email,
    contextLine,
    stats: [
      stat("Open opportunities", counts.openOpportunities ?? 0),
      stat("Applications", counts.applications ?? 0),
      stat("Shortlisted", counts.shortlisted ?? 0),
      stat("Unread notifications", unread),
    ],
    sections,
    quickActions: [
      {
        title: "Quick access",
        actions: [
          {
            title: "Placement hub",
            detail: "Companies, opportunities, pipeline",
            href: "/placement",
            tone: "blue",
          },
          {
            title: "Companies",
            detail: "Directory & approval status",
            href: "/placement/companies",
            tone: "gold",
          },
          {
            title: "Opportunities",
            detail: "Jobs and internships",
            href: "/placement/opportunities",
            tone: "green",
          },
          {
            title: "Appointments",
            detail: "TPO & faculty history",
            href: "/placement/appointments",
            tone: "blue",
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export async function loadDashboard(
  ctx: AuthContext
): Promise<DashboardPayload> {
  switch (ctx.roleName) {
    case ROLES.student:
      return loadStudentDashboard(ctx);
    case ROLES.faculty:
      return loadFacultyDashboard(ctx);
    case ROLES.hod:
      return loadHodDashboard(ctx);
    case ROLES.directorDean:
      return loadInstitutionLeaderDashboard(ctx, "director_dean");
    case ROLES.admin:
      return loadInstitutionLeaderDashboard(ctx, "admin");
    case ROLES.systemAdmin:
      return loadSystemAdminDashboard(ctx);
    case ROLES.tpo:
      return loadTpoDashboard(ctx);
    default:
      // Unknown role: minimal safe payload (identity + notifications only).
      return {
        roleName: ctx.roleName,
        displayName: ctx.fullName || ctx.email,
        contextLine: `Role “${ctx.roleName}” has no dedicated dashboard yet.`,
        stats: [
          stat("Unread notifications", await countUnreadNotifications(ctx)),
        ],
        sections: [
          section(
            "notifications",
            "Notifications",
            (await listNotifications(ctx, { limit: 5 })).map((n) => ({
              id: n.id,
              title: n.title,
              meta: formatDateTime(n.created_at),
              badge: n.priority,
              href: "/notifications",
            })),
            "No notifications yet.",
            { moreHref: "/notifications", moreLabel: "Open notifications" }
          ),
        ],
        quickActions: [
          {
            title: "Quick access",
            actions: [
              {
                title: "Profile",
                detail: "Your account",
                href: "/profile",
                tone: "green",
              },
              {
                title: "Notifications",
                detail: "Updates",
                href: "/notifications",
                tone: "blue",
              },
            ],
          },
        ],
      };
  }
}
