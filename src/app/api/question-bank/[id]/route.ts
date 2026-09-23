import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { getQuestionView, updateQuestion } from "@/lib/question-bank";
import { AssessmentValidationError } from "@/lib/assessment-types";

/**
 * GET   /api/question-bank/[id] — one bank question (not for students).
 * PATCH /api/question-bank/[id] — edit content / approve / retire (owner/HOD/admin).
 */
export async function GET(
  _request: Request,
  routeCtx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await routeCtx.params;
    const question = await getQuestionView(auth, id);
    return NextResponse.json({ question: map(question) });
  } catch (error) {
    return handleErr(error);
  }
}

export async function PATCH(
  request: Request,
  routeCtx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await routeCtx.params;
    const body = await request.json();
    const question = await updateQuestion(auth, id, {
      questionText: body.questionText,
      answerKey: body.answerKey,
      explanation: body.explanation,
      marks: body.marks,
      difficulty: body.difficulty,
      unitRef: body.unitRef,
      status: body.status,
      options: body.options,
    });
    return NextResponse.json({ question: map(question) });
  } catch (error) {
    return handleErr(error);
  }
}

function map(q: {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  academic_year_id: string | null;
  question_type: string;
  question_text: string;
  options: unknown;
  answer_key: string;
  explanation: string;
  marks: number;
  difficulty: string;
  unit_ref: string | null;
  status: string;
  owner_id: string;
  owner_name: string;
  created_by: string;
  is_owner: boolean;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: q.id,
    subjectId: q.subject_id,
    subjectName: q.subject_name,
    subjectCode: q.subject_code,
    academicYearId: q.academic_year_id,
    questionType: q.question_type,
    questionText: q.question_text,
    options: q.options,
    answerKey: q.answer_key,
    explanation: q.explanation,
    marks: q.marks,
    difficulty: q.difficulty,
    unitRef: q.unit_ref,
    status: q.status,
    ownerId: q.owner_id,
    ownerName: q.owner_name,
    createdBy: q.created_by,
    isOwner: q.is_owner,
    approvedAt: q.approved_at,
    createdAt: q.created_at,
    updatedAt: q.updated_at,
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
