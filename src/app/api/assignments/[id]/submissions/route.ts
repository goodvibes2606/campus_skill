import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  listSubmissionsForAssignment,
  createSubmission,
} from "@/lib/assignments";
import { AssessmentValidationError } from "@/lib/assessment-types";

/**
 * GET  /api/assignments/[id]/submissions — submissions for an assignment.
 *      Students always get own rows only (server-side).
 * POST /api/assignments/[id]/submissions — student creates own attempt.
 *
 * Body (POST): { contentText, contentNote?, submit? }
 */
export async function GET(
  request: Request,
  routeCtx: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await routeCtx.params;
    const { searchParams } = new URL(request.url);
    const submissions = await listSubmissionsForAssignment(ctx, id, {
      studentId: searchParams.get("studentId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });
    return NextResponse.json({
      count: submissions.length,
      submissions: submissions.map(toPublicView),
    });
  } catch (error) {
    return handleErr(error);
  }
}

export async function POST(
  request: Request,
  routeCtx: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await routeCtx.params;
    const body = await request.json();
    const submission = await createSubmission(ctx, id, {
      contentText: String(body.contentText ?? ""),
      contentNote: body.contentNote ? String(body.contentNote) : "",
      submit: body.submit !== false,
    });
    return NextResponse.json(
      { submission: toPublicView(submission) },
      { status: 201 }
    );
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(s: Record<string, unknown>) {
  return {
    id: s.id,
    assignmentId: s.assignment_id,
    assignmentTitle: s.assignment_title,
    studentId: s.student_id,
    studentName: s.student_name,
    attemptNumber: s.attempt_number,
    status: s.status,
    contentText: s.content_text,
    contentNote: s.content_note,
    submittedAt: s.submitted_at,
    returnedAt: s.returned_at,
    score: s.score,
    maxPointsSnapshot: s.max_points_snapshot,
    feedback: s.feedback,
    reviewedBy: s.reviewed_by,
    reviewedAt: s.reviewed_at,
    isStudent: s.is_student,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
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
      message: error instanceof Error ? error.message : "unknown",
    },
    { status: 500 }
  );
}
