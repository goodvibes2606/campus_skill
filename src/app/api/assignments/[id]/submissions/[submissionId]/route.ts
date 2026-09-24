import { NextResponse } from "next/server";

import { AuthzError, getAuthContext, ROLES } from "@/lib/authz";
import {
  getSubmissionView,
  reviewSubmission,
} from "@/lib/assignments";
import { AssessmentValidationError } from "@/lib/assessment-types";

/**
 * GET   /api/assignments/[id]/submissions/[submissionId]
 *       — one submission (own student / reviewer only).
 * PATCH — faculty/HOD/admin review: grade or return.
 *
 * Body: { action?: "grade" | "return", score?, feedback? }
 */
export async function GET(
  _request: Request,
  routeCtx: { params: Promise<{ id: string; submissionId: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { submissionId } = await routeCtx.params;
    const submission = await getSubmissionView(auth, submissionId);
    return NextResponse.json({ submission: map(submission) });
  } catch (error) {
    return handleErr(error);
  }
}

export async function PATCH(
  request: Request,
  routeCtx: { params: Promise<{ id: string; submissionId: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    if (auth.roleName === ROLES.student) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Students may not review submissions" },
        { status: 403 }
      );
    }
    const { submissionId } = await routeCtx.params;
    const body = await request.json();
    const submission = await reviewSubmission(auth, submissionId, {
      action: body.action,
      score: body.score,
      feedback: body.feedback,
    });
    return NextResponse.json({ submission: map(submission) });
  } catch (error) {
    return handleErr(error);
  }
}

function map(s: {
  id: string;
  assignment_id: string;
  assignment_title: string;
  student_id: string;
  student_name: string;
  attempt_number: number;
  status: string;
  content_text: string;
  content_note: string;
  submitted_at: Date | null;
  returned_at: Date | null;
  score: number | null;
  max_points_snapshot: number | null;
  feedback: string;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  is_student?: boolean;
  created_at: Date;
  updated_at: Date;
}) {
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
    isStudent: s.is_student ?? s.student_id === undefined,
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
      message: "Something went wrong. Try again.",
    },
    { status: 500 }
  );
}
