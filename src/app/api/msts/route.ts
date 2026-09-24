import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { listMsts, createMst } from "@/lib/mst";
import { AssessmentValidationError } from "@/lib/assessment-types";

/**
 * GET  /api/msts — MST-1/MST-2 records visible to caller.
 * POST /api/msts — create MST (faculty/HOD/admin with scope).
 *
 * Body (POST):
 * {
 *   sectionId, subjectId, mstNumber (1|2), title,
 *   description?, scheduledOn?, maxMarks?, questionPaperId?, status?, createPaper?
 * }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const mstNumberRaw = searchParams.get("mstNumber");
    const mstNumber =
      mstNumberRaw === "1" ? 1 : mstNumberRaw === "2" ? 2 : undefined;
    const msts = await listMsts(ctx, {
      status: searchParams.get("status") ?? undefined,
      mstNumber,
      sectionId: searchParams.get("sectionId") ?? undefined,
      subjectId: searchParams.get("subjectId") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 50) || 50,
    });
    return NextResponse.json({
      count: msts.length,
      msts: msts.map(toPublicView),
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
    const mst = await createMst(ctx, {
      sectionId: String(body.sectionId ?? ""),
      subjectId: String(body.subjectId ?? ""),
      mstNumber: Number(body.mstNumber ?? 0),
      title: String(body.title ?? ""),
      description: body.description ? String(body.description) : "",
      scheduledOn: body.scheduledOn ?? null,
      maxMarks: body.maxMarks,
      questionPaperId: body.questionPaperId || null,
      status: body.status,
      createPaper: body.createPaper === true,
    });
    return NextResponse.json({ mst: toPublicView(mst) }, { status: 201 });
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(m: Record<string, unknown>) {
  return {
    id: m.id,
    mstNumber: m.mst_number,
    title: m.title,
    description: m.description,
    scheduledOn: m.scheduled_on,
    maxMarks: m.max_marks,
    questionPaperId: m.question_paper_id,
    status: m.status,
    sectionId: m.section_id,
    sectionName: m.section_name,
    subjectId: m.subject_id,
    subjectName: m.subject_name,
    subjectCode: m.subject_code,
    academicYearId: m.academic_year_id,
    academicYear: m.academic_year_name,
    ownerId: m.owner_id,
    ownerName: m.owner_name,
    createdBy: m.created_by,
    isOwner: m.is_owner,
    approvalNote: m.approval_note,
    approvedAt: m.approved_at,
    publishedAt: m.published_at,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
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
