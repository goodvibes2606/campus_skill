import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { listQuestionBank, createQuestion } from "@/lib/question-bank";
import { AssessmentValidationError } from "@/lib/assessment-types";

/**
 * GET  /api/question-bank — bank items visible to caller (students: empty/403).
 * POST /api/question-bank — add question (faculty/HOD/admin in subject scope).
 *
 * Body (POST):
 * {
 *   subjectId, academicYearId?, questionType?, questionText,
 *   options?, answerKey?, explanation?, marks?, difficulty?, unitRef?, status?
 * }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const items = await listQuestionBank(ctx, {
      status: searchParams.get("status") ?? undefined,
      subjectId: searchParams.get("subjectId") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 50) || 50,
    });
    return NextResponse.json({
      count: items.length,
      questions: items.map(toPublicView),
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
    const question = await createQuestion(ctx, {
      subjectId: String(body.subjectId ?? ""),
      academicYearId: body.academicYearId || null,
      questionType: body.questionType,
      questionText: String(body.questionText ?? ""),
      options: body.options,
      answerKey: body.answerKey,
      explanation: body.explanation,
      marks: body.marks,
      difficulty: body.difficulty,
      unitRef: body.unitRef ?? null,
      status: body.status,
    });
    return NextResponse.json(
      { question: toPublicView(question) },
      { status: 201 }
    );
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(q: Record<string, unknown>) {
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
