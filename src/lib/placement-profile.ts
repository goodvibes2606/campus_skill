import { pool } from "@/lib/db";
import { AuthzError, type AuthContext } from "@/lib/authz";
import { assertPlacementInstitution, getPlacementScope } from "@/lib/placement-scope";
import {
  PlacementValidationError,
  isCareerReadiness,
  optionalText,
  parseTagList,
} from "@/lib/placement-types";

/**
 * Student career profile foundation (Milestone 9).
 * Academic identity stays on enrollment — not duplicated here.
 * Students edit only their own profile. No AI resume generation.
 */

export type CareerProfileRow = {
  id: string;
  student_id: string;
  institution_id: string;
  headline: string;
  summary: string;
  skills: string[];
  career_interests: string[];
  resume_reference: string | null;
  readiness: "not_started" | "in_progress" | "ready";
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CareerProfileView = CareerProfileRow & {
  student_name: string;
  student_email: string;
  enrollment_context: string | null;
  is_own: boolean;
};

const SELECT_PROFILE = `
  SELECT cp.*,
         p.full_name AS student_name,
         p.email AS student_email
    FROM public.student_career_profiles cp
    JOIN public.profiles p ON p.id = cp.student_id
`;

async function loadEnrollmentContext(studentId: string): Promise<string | null> {
  const r = await pool.query<{
    program_name: string;
    section_name: string;
    semester_number: number;
    academic_year_name: string;
  }>(
    `SELECT pr.name AS program_name,
            sec.name AS section_name,
            sm.semester_number,
            ay.name AS academic_year_name
       FROM public.student_enrollments e
       JOIN public.programs pr ON pr.id = e.program_id
       JOIN public.semesters sm ON sm.id = e.semester_id
       JOIN public.academic_years ay ON ay.id = e.academic_year_id
       JOIN public.sections sec ON sec.id = e.section_id
      WHERE e.student_id = $1 AND e.status = 'active'
      LIMIT 1`,
    [studentId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return `${row.program_name} · ${row.section_name} · Sem ${row.semester_number} · ${row.academic_year_name}`;
}

async function hydrate(
  ctx: AuthContext,
  row: CareerProfileRow
): Promise<CareerProfileView> {
  const detail = await pool.query<
    CareerProfileRow & {
      student_name: string;
      student_email: string;
    }
  >(
    `${SELECT_PROFILE} WHERE cp.id = $1`,
    [row.id]
  );
  const out = detail.rows[0];
  if (!out) {
    throw new Error(`Career profile missing: ${row.id}`);
  }
  return {
    ...out,
    skills: Array.isArray(out.skills) ? out.skills : [],
    career_interests: Array.isArray(out.career_interests)
      ? out.career_interests
      : [],
    enrollment_context: await loadEnrollmentContext(out.student_id),
    is_own: out.student_id === ctx.userId,
  };
}

/**
 * Get career profile for a student.
 * - student → own row only (IDOR-safe; empty profile when none yet)
 * - operator/oversight → same-institution rows
 */
export async function getCareerProfile(
  ctx: AuthContext,
  studentId?: string
): Promise<CareerProfileView | null> {
  const scope = await getPlacementScope(ctx);
  if (scope.access === "denied") {
    throw new AuthzError("FORBIDDEN", "No placement access");
  }

  const targetId =
    scope.access === "student" ? ctx.userId : (studentId ?? ctx.userId);
  if (scope.access === "student" && studentId && studentId !== ctx.userId) {
    throw new AuthzError("FORBIDDEN", "Profile not found");
  }

  const existing = await pool.query<CareerProfileRow>(
    `SELECT * FROM public.student_career_profiles WHERE student_id = $1`,
    [targetId]
  );
  const row = existing.rows[0];
  if (!row) {
    if (scope.access === "student") return null;
    return null;
  }
  if (scope.institutionId) {
    assertPlacementInstitution(scope, row.institution_id);
  }
  return hydrate(ctx, row);
}

export type UpsertCareerProfileInput = {
  studentId?: string;
  headline?: string;
  summary?: string;
  skills?: unknown;
  careerInterests?: unknown;
  resumeReference?: string | null;
  readiness?: string;
};

/**
 * Create or update a career profile.
 * Students: own row only. Operators/oversight may not edit content
 * (read-only oversight) unless acting as the student session.
 */
export async function upsertCareerProfile(
  ctx: AuthContext,
  input: UpsertCareerProfileInput
): Promise<CareerProfileView> {
  const scope = await getPlacementScope(ctx);
  if (scope.access !== "student") {
    throw new AuthzError(
      "FORBIDDEN",
      "Only the student may edit their own career profile"
    );
  }
  if (!ctx.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }
  const studentId = input.studentId && input.studentId !== ctx.userId
    ? null
    : ctx.userId;
  if (!studentId) {
    throw new AuthzError("FORBIDDEN", "Students may only edit their own profile");
  }

  // Require an active enrollment so academic context always exists downstream.
  const enr = await pool.query<{ institution_id: string }>(
    `SELECT institution_id FROM public.student_enrollments
      WHERE student_id = $1 AND status = 'active' LIMIT 1`,
    [studentId]
  );
  if (!enr.rows[0]) {
    throw new PlacementValidationError(
      "An active enrollment is required before completing your career profile"
    );
  }

  const headline =
    input.headline !== undefined
      ? optionalText(input.headline, "headline", 160)
      : undefined;
  const summary =
    input.summary !== undefined
      ? optionalText(input.summary, "summary", 4000)
      : undefined;
  const skills =
    input.skills !== undefined ? parseTagList(input.skills, 40, 60) : undefined;
  const interests =
    input.careerInterests !== undefined
      ? parseTagList(input.careerInterests, 40, 80)
      : undefined;
  const resume =
    input.resumeReference !== undefined
      ? optionalText(input.resumeReference, "resumeReference", 500) || null
      : undefined;
  const readiness =
    input.readiness !== undefined ? input.readiness : undefined;
  if (readiness !== undefined && !isCareerReadiness(readiness)) {
    throw new PlacementValidationError(
      "readiness must be not_started, in_progress, or ready"
    );
  }

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM public.student_career_profiles WHERE student_id = $1`,
    [studentId]
  );

  if (!existing.rows[0]) {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO public.student_career_profiles (
          student_id, institution_id, headline, summary, skills,
          career_interests, resume_reference, readiness, updated_by
       ) VALUES ($1,$2,COALESCE($3,''),COALESCE($4,''),
                 COALESCE($5::jsonb,'[]'::jsonb),
                 COALESCE($6::jsonb,'[]'::jsonb),
                 $7, COALESCE($8,'not_started'), $9)
       RETURNING id`,
      [
        studentId,
        ctx.institutionId,
        headline ?? "",
        summary ?? "",
        skills !== undefined ? JSON.stringify(skills) : null,
        interests !== undefined ? JSON.stringify(interests) : null,
        resume ?? null,
        readiness ?? null,
        ctx.userId,
      ]
    );
    const row = await pool.query<CareerProfileRow>(
      `SELECT * FROM public.student_career_profiles WHERE id = $1`,
      [inserted.rows[0].id]
    );
    return hydrate(ctx, row.rows[0]);
  }

  await pool.query(
    `UPDATE public.student_career_profiles SET
        headline = COALESCE($2, headline),
        summary = COALESCE($3, summary),
        skills = CASE WHEN $4::boolean THEN $5::jsonb ELSE skills END,
        career_interests = CASE WHEN $6::boolean THEN $7::jsonb ELSE career_interests END,
        resume_reference = CASE WHEN $8::boolean THEN $9 ELSE resume_reference END,
        readiness = COALESCE($10, readiness),
        updated_by = $11
      WHERE student_id = $1`,
    [
      studentId,
      headline ?? null,
      summary ?? null,
      skills !== undefined,
      skills !== undefined ? JSON.stringify(skills) : "[]",
      interests !== undefined,
      interests !== undefined ? JSON.stringify(interests) : "[]",
      resume !== undefined,
      resume ?? null,
      readiness ?? null,
      ctx.userId,
    ]
  );

  const updated = await pool.query<CareerProfileRow>(
    `SELECT * FROM public.student_career_profiles WHERE student_id = $1`,
    [studentId]
  );
  return hydrate(ctx, updated.rows[0]);
}

/** List career profiles — students get only their own; staff get institution. */
export async function listCareerProfiles(
  ctx: AuthContext,
  query: { readiness?: string; mine?: boolean; limit?: number } = {}
): Promise<CareerProfileView[]> {
  const scope = await getPlacementScope(ctx);
  if (scope.access === "denied") {
    throw new AuthzError("FORBIDDEN", "No placement access");
  }
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (scope.access === "student" || query.mine) {
    params.push(ctx.userId);
    clauses.push(`cp.student_id = $${params.length}`);
  } else if (scope.institutionId) {
    params.push(scope.institutionId);
    clauses.push(`cp.institution_id = $${params.length}`);
  } else {
    return [];
  }

  if (query.readiness) {
    params.push(query.readiness);
    clauses.push(`cp.readiness = $${params.length}`);
  }
  params.push(limit);
  const where = clauses.length ? `AND ${clauses.join(" AND ")}` : "";

  const result = await pool.query<CareerProfileRow>(
    `SELECT cp.*,
            p.full_name AS student_name,
            p.email AS student_email
       FROM public.student_career_profiles cp
       JOIN public.profiles p ON p.id = cp.student_id
      WHERE 1=1 ${where}
      ORDER BY cp.updated_at DESC
      LIMIT $${params.length}`,
    params
  );

  return Promise.all(result.rows.map((r) => hydrate(ctx, r)));
}
