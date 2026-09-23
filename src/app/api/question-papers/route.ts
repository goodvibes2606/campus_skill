import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  listQuestionPapers,
  createQuestionPaper,
} from "@/lib/question-bank";
import { AssessmentValidationError } from "@/lib/assessment-types";

/**
 * GET  /api/question-papers — papers visible to caller (server-side filter).
 * POST /api/question-papers — create paper (faculty/HOD/admin with scope).
 *
 * Body (POST):
 * {
 *   sectionId?, subjectId, academicYearId?, semesterId?,
 *   title, description?, paperKind?, totalMarks?, durationMinutes?, status?
 * }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const papers = await listQuestionPapers(ctx, {
      status: searchParams.get("status") ?? undefined,
      subjectId: searchParams.get("subjectId") ?? undefined,
      paperKind: searchParams.get("paperKind") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 50) || 50,
    });
    return NextResponse.json({
      count: papers.length,
      papers: papers.map(toPublicView),
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
    const paper = await createQuestionPaper(ctx, {
      sectionId: body.sectionId || null,
      subjectId: String(body.subjectId ?? ""),
      academicYearId: body.academicYearId || null,
      semesterId: body.semesterId || null,
      title: String(body.title ?? ""),
      description: body.description ? String(body.description) : "",
      paperKind: body.paperKind,
      totalMarks: body.totalMarks,
      durationMinutes: body.durationMinutes,
      status: body.status,
    });
    return NextResponse.json(
      { paper: toPublicView(paper) },
      { status: 201 }
    );
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(p: Record<string, unknown>) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    paperKind: p.paper_kind,
    totalMarks: p.total_marks,
    durationMinutes: p.duration_minutes,
    status: p.status,
    sectionId: p.section_id,
    sectionName: p.section_name,
    subjectId: p.subject_id,
    subjectName: p.subject_name,
    subjectCode: p.subject_code,
    academicYearId: p.academic_year_id,
    semesterId: p.semester_id,
    ownerId: p.owner_id,
    ownerName: p.owner_name,
    createdBy: p.created_by,
    isOwner: p.is_owner,
    itemCount: p.item_count,
    version: p.version,
    approvalNote: p.approval_note,
    approvedAt: p.approved_at,
    publishedAt: p.published_at,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
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
