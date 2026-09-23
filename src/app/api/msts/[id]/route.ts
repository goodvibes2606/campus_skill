import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { getMstView, updateMst } from "@/lib/mst";
import { AssessmentValidationError } from "@/lib/assessment-types";

/**
 * GET   /api/msts/[id] — one MST (visibility-checked).
 * PATCH /api/msts/[id] — content/status lifecycle (owner/HOD/admin;
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
    const mst = await getMstView(auth, id);
    return NextResponse.json({ mst: map(mst) });
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
    const mst = await updateMst(auth, id, {
      title: body.title,
      description: body.description,
      scheduledOn: body.scheduledOn,
      maxMarks: body.maxMarks,
      questionPaperId: body.questionPaperId,
      status: body.status,
      approvalNote: body.approvalNote,
    });
    return NextResponse.json({ mst: map(mst) });
  } catch (error) {
    return handleErr(error);
  }
}

function map(m: {
  id: string;
  mst_number: number;
  title: string;
  description: string;
  scheduled_on: string | Date | null;
  max_marks: number;
  question_paper_id: string | null;
  status: string;
  section_id: string;
  section_name: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  academic_year_id: string;
  academic_year_name: string;
  owner_id: string;
  owner_name: string;
  created_by: string;
  is_owner: boolean;
  approval_note: string | null;
  approved_at: Date | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}) {
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
      message: error instanceof Error ? error.message : "unknown",
    },
    { status: 500 }
  );
}
