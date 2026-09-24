import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  listVisibleAssignments,
  createAssignment,
} from "@/lib/assignments";
import { AssessmentValidationError } from "@/lib/assessment-types";

/**
 * GET  /api/assignments — list assignments visible to caller (server-side filter).
 * POST /api/assignments — create assignment (faculty/HOD/admin with scope).
 *
 * Body (POST):
 * {
 *   sectionId, subjectId, title,
 *   description?, instructions?, dueAt?, maxPoints?, allowResubmit?, status?
 * }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const assignments = await listVisibleAssignments(ctx, {
      status: searchParams.get("status") ?? undefined,
      sectionId: searchParams.get("sectionId") ?? undefined,
      subjectId: searchParams.get("subjectId") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 50) || 50,
    });
    return NextResponse.json({
      count: assignments.length,
      assignments: assignments.map(toPublicView),
    });
  } catch (error) {
    return handleErr(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const body = await request.json();
    const assignment = await createAssignment(ctx, {
      sectionId: String(body.sectionId ?? ""),
      subjectId: String(body.subjectId ?? ""),
      title: String(body.title ?? ""),
      description: body.description ? String(body.description) : "",
      instructions: body.instructions ? String(body.instructions) : "",
      dueAt: body.dueAt ?? null,
      maxPoints: body.maxPoints ?? null,
      allowResubmit: body.allowResubmit === true,
      status: body.status ?? undefined,
    });
    return NextResponse.json(
      { assignment: toPublicView(assignment) },
      { status: 201 }
    );
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(a: Record<string, unknown>) {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    instructions: a.instructions,
    status: a.status,
    dueAt: a.due_at,
    maxPoints: a.max_points,
    allowResubmit: a.allow_resubmit,
    version: a.version,
    sectionId: a.section_id,
    sectionName: a.section_name,
    subjectId: a.subject_id,
    subjectName: a.subject_name,
    subjectCode: a.subject_code,
    academicYearId: a.academic_year_id,
    academicYear: a.academic_year_name,
    semesterNumber: a.semester_number,
    ownerId: a.owner_id,
    ownerName: a.owner_name,
    createdBy: a.created_by,
    isOwner: a.is_owner,
    submissionCount: a.submission_count,
    publishedAt: a.published_at,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

function handleErr(error: unknown) {
  if (error instanceof AssessmentValidationError) {
    return NextResponse.json(
      { error: "VALIDATION", message: error.message },
      { status: 400 }
    );
  }
  if (error instanceof AuthzError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }
  return NextResponse.json(
    {
      error: "server_error",
      message: "Something went wrong. Try again.",
    },
    { status: 500 }
  );
}
