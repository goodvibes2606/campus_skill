import { pool } from "@/lib/db";
import { AuthzError, ROLES, type AuthContext } from "@/lib/authz";
import { getAcademicScope, activeHeadshipDepartmentIds } from "@/lib/academic-scope";
import { getPlacementScope } from "@/lib/placement-scope";
import { assertCanAccessResource } from "@/lib/resources";
import { assertCanAccessAssignment } from "@/lib/assignments";
import { assertCanAccessSyllabus, listUnits, listTopics } from "@/lib/syllabus";
import { getOpportunity } from "@/lib/placement-opportunities";
import {
  AiValidationError,
  type AiContextKind,
  type SafeAiContext,
} from "@/lib/ai/types";
import { allowedContextKinds } from "@/lib/ai-features";

/**
 * Server-side AI context validation (Milestone 10).
 *
 * Every context ID from the client is re-authorized here before any text
 * reaches the AI provider. Students cannot reference another student's data;
 * faculty/HOD stay department/assignment scoped; system_admin gets no
 * academic context. Client-supplied role/institution IDs are never trusted.
 */

export type AiContextRequest = {
  kind?: string;
  id?: string;
};

const MAX_SUMMARY = 1500;
const MAX_DETAILS = 12;
const MAX_DETAIL_LEN = 240;

function clip(text: string, max: number): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function pushDetail(details: string[], line: string): void {
  if (details.length >= MAX_DETAILS) return;
  const v = clip(line, MAX_DETAIL_LEN);
  if (v) details.push(v);
}

/** Validate + load a subject the caller may use in AI context. */
async function loadSubjectContext(
  ctx: AuthContext,
  subjectId: string
): Promise<SafeAiContext> {
  const row = await pool.query<{
    id: string;
    name: string;
    subject_code: string;
    institution_id: string;
    program_id: string;
    department_id: string;
  }>(
    `SELECT s.id, s.name, s.subject_code, s.institution_id,
            s.program_id, p.department_id
       FROM public.subjects s
       JOIN public.programs p ON p.id = s.program_id
      WHERE s.id = $1`,
    [subjectId]
  );
  const subject = row.rows[0];
  if (!subject) {
    throw new AuthzError("FORBIDDEN", "Subject not found");
  }

  if (ctx.roleName === ROLES.systemAdmin) {
    throw new AuthzError("FORBIDDEN", "Academic context not available");
  }

  if (ctx.roleName === ROLES.student) {
    const scope = await getAcademicScope(ctx);
    const enr = scope.enrollment;
    if (!enr || enr.status !== "active") {
      throw new AuthzError("FORBIDDEN", "No active enrollment");
    }
    if (subject.institution_id !== enr.institution_id) {
      throw new AuthzError("FORBIDDEN", "Institution access denied");
    }
    const link = await pool.query(
      `SELECT 1 FROM public.section_subjects
        WHERE section_id = $1 AND subject_id = $2 AND status = 'active'`,
      [enr.section_id, subjectId]
    );
    if (link.rows.length === 0) {
      throw new AuthzError(
        "FORBIDDEN",
        "Subject is not part of your enrolled section"
      );
    }
  } else if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.hod) {
    if (!ctx.institutionId || subject.institution_id !== ctx.institutionId) {
      throw new AuthzError("FORBIDDEN", "Institution access denied");
    }
    const scope = await getAcademicScope(ctx);
    const teaches = scope.facultyAssignments.some(
      (a) => a.status === "active" && a.subject_id === subjectId
    );
    const ownsLink = await pool.query(
      `SELECT 1 FROM public.section_subjects
        WHERE subject_id = $1 AND faculty_id = $2 AND status = 'active'`,
      [subjectId, ctx.userId]
    );
    const headsDept =
      ctx.roleName === ROLES.hod &&
      activeHeadshipDepartmentIds(scope.headships).includes(
        subject.department_id
      );
    if (!teaches && ownsLink.rows.length === 0 && !headsDept) {
      throw new AuthzError(
        "FORBIDDEN",
        "No teaching assignment covers this subject"
      );
    }
  } else {
    // director_dean / admin — institution read scope only.
    if (!ctx.institutionId || subject.institution_id !== ctx.institutionId) {
      throw new AuthzError("FORBIDDEN", "Institution access denied");
    }
  }

  return {
    kind: "subject",
    label: `${subject.subject_code} · ${subject.name}`,
    summary: `Subject: ${subject.name} (${subject.subject_code}).`,
    validated: true,
  };
}

async function loadResourceContext(
  ctx: AuthContext,
  resourceId: string
): Promise<SafeAiContext> {
  if (ctx.roleName === ROLES.systemAdmin) {
    throw new AuthzError("FORBIDDEN", "Academic context not available");
  }
  const row = await assertCanAccessResource(ctx, resourceId);
  const details: string[] = [];
  pushDetail(details, `Type: ${row.resource_type}`);
  pushDetail(details, `Status: ${row.status}`);
  if (row.description) pushDetail(details, `Description: ${row.description}`);
  if (row.unit_ref) pushDetail(details, `Unit ref: ${row.unit_ref}`);
  if (row.topic_ref) pushDetail(details, `Topic ref: ${row.topic_ref}`);

  return {
    kind: "resource",
    label: row.title,
    summary: clip(
      `Authorized academic resource “${row.title}”. ${row.description || ""}`,
      MAX_SUMMARY
    ),
    details,
    validated: true,
  };
}

async function loadAssignmentContext(
  ctx: AuthContext,
  assignmentId: string
): Promise<SafeAiContext> {
  if (ctx.roleName === ROLES.systemAdmin) {
    throw new AuthzError("FORBIDDEN", "Academic context not available");
  }
  const row = await assertCanAccessAssignment(ctx, assignmentId);
  const details: string[] = [];
  pushDetail(details, `Status: ${row.status}`);
  if (row.due_at) {
    pushDetail(
      details,
      `Due: ${row.due_at instanceof Date ? row.due_at.toISOString().slice(0, 10) : String(row.due_at)}`
    );
  }
  if (row.max_points != null) pushDetail(details, `Max points: ${row.max_points}`);
  if (row.instructions) pushDetail(details, `Instructions: ${row.instructions}`);

  return {
    kind: "assignment",
    label: row.title,
    summary: clip(
      `Assignment “${row.title}”. ${row.description || ""}`,
      MAX_SUMMARY
    ),
    details,
    validated: true,
  };
}

async function loadSyllabusContext(
  ctx: AuthContext,
  syllabusId: string
): Promise<SafeAiContext> {
  if (ctx.roleName === ROLES.systemAdmin) {
    throw new AuthzError("FORBIDDEN", "Academic context not available");
  }
  const row = await assertCanAccessSyllabus(ctx, syllabusId);
  const units = await listUnits(ctx, syllabusId);
  const details: string[] = [];
  for (const u of units.slice(0, 6)) {
    const topics = await listTopics(ctx, u.id);
    const topicTitles = topics.map((t) => t.title).join(", ");
    pushDetail(
      details,
      `Unit ${u.unit_number}: ${u.title}${topicTitles ? ` — ${topicTitles}` : ""}`
    );
  }

  return {
    kind: "syllabus",
    label: row.title,
    summary: clip(
      `Syllabus “${row.title}” (v${row.version}, ${row.status}). ${row.description || ""}`,
      MAX_SUMMARY
    ),
    details,
    validated: true,
  };
}

async function loadOpportunityContext(
  ctx: AuthContext,
  opportunityId: string
): Promise<SafeAiContext> {
  if (ctx.roleName === ROLES.systemAdmin) {
    throw new AuthzError("FORBIDDEN", "Placement context not available");
  }
  const scope = await getPlacementScope(ctx);
  if (scope.access === "denied") {
    throw new AuthzError("FORBIDDEN", "No placement access");
  }
  const opp = await getOpportunity(ctx, opportunityId);
  const details: string[] = [];
  pushDetail(details, `Company: ${opp.company_name}`);
  pushDetail(details, `Kind: ${opp.opportunity_kind}`);
  pushDetail(details, `Status: ${opp.status}`);
  if (opp.location) pushDetail(details, `Location: ${opp.location}`);
  if (opp.employment_type) pushDetail(details, `Type: ${opp.employment_type}`);
  if (opp.compensation) pushDetail(details, `Compensation: ${opp.compensation}`);
  if (opp.application_deadline) {
    pushDetail(
      details,
      `Deadline: ${String(opp.application_deadline).slice(0, 10)}`
    );
  }

  return {
    kind: "opportunity",
    label: opp.title,
    summary: clip(
      `Placement opportunity “${opp.title}” at ${opp.company_name}. ${opp.description || ""}`,
      MAX_SUMMARY
    ),
    details,
    validated: true,
  };
}

/**
 * Validate an optional client context reference and return a SafeAiContext.
 * Returns null when no context was requested. Throws AuthzError /
 * AiValidationError on unauthorized or malformed input.
 */
export async function resolveAiContext(
  ctx: AuthContext,
  request: AiContextRequest
): Promise<SafeAiContext | null> {
  const kind = (request.kind || "").trim();
  const id = (request.id || "").trim();
  if (!kind || kind === "general") return null;
  if (!id) {
    throw new AiValidationError("Context id is required for this context kind");
  }
  if (id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new AiValidationError("Invalid context id");
  }

  const allowed = allowedContextKinds(ctx.roleName) as string[];
  if (!allowed.includes(kind)) {
    throw new AuthzError(
      "FORBIDDEN",
      `Context kind “${kind}” is not available for your role`
    );
  }

  switch (kind as AiContextKind) {
    case "subject":
      return loadSubjectContext(ctx, id);
    case "resource":
      return loadResourceContext(ctx, id);
    case "assignment":
      return loadAssignmentContext(ctx, id);
    case "syllabus":
      return loadSyllabusContext(ctx, id);
    case "opportunity":
      return loadOpportunityContext(ctx, id);
    default:
      throw new AiValidationError("Unknown context kind");
  }
}
