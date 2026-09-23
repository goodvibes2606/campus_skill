import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  getQuestionPaperView,
  updateQuestionPaper,
} from "@/lib/question-bank";
import { AssessmentValidationError } from "@/lib/assessment-types";

/**
 * GET   /api/question-papers/[id] — one paper (visibility-checked).
 * PATCH /api/question-papers/[id] — content/status lifecycle (owner/HOD/admin;
 *       approval requires HOD/admin; publish requires approved first).
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
    const paper = await getQuestionPaperView(auth, id);
    return NextResponse.json({ paper: map(paper) });
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
    const paper = await updateQuestionPaper(auth, id, {
      title: body.title,
      description: body.description,
      status: body.status,
      approvalNote: body.approvalNote,
      totalMarks: body.totalMarks,
      durationMinutes: body.durationMinutes,
    });
    return NextResponse.json({ paper: map(paper) });
  } catch (error) {
    return handleErr(error);
  }
}

function map(p: {
  id: string;
  title: string;
  description: string;
  paper_kind: string;
  total_marks: number;
  duration_minutes: number | null;
  status: string;
  section_id: string | null;
  section_name: string | null;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  academic_year_id: string;
  semester_id: string;
  owner_id: string;
  owner_name: string;
  created_by: string;
  is_owner: boolean;
  item_count: number;
  version: number;
  approval_note: string | null;
  approved_at: Date | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}) {
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
