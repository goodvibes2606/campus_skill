import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { getSyllabusView, updateSyllabus } from "@/lib/syllabus";
import { AcademicOpsValidationError } from "@/lib/academic-ops-types";

/**
 * GET   /api/syllabi/[id] — one syllabus (visibility-checked).
 * PATCH /api/syllabi/[id] — update content/status lifecycle (authz by transition).
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
    const syllabus = await getSyllabusView(auth, id);
    return NextResponse.json({ syllabus: map(syllabus) });
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
    const syllabus = await updateSyllabus(auth, id, {
      title: body.title,
      description: body.description,
      status: body.status,
      sourceType: body.sourceType,
      sourceReference: body.sourceReference,
      sourceNotes: body.sourceNotes,
      sourceIsOfficial: body.sourceIsOfficial,
      approvalNote: body.approvalNote,
    });
    return NextResponse.json({ syllabus: map(syllabus) });
  } catch (error) {
    return handleErr(error);
  }
}

function map(s: {
  id: string;
  title: string;
  description: string;
  version: number;
  status: string;
  source_type: string;
  source_reference: string | null;
  source_notes: string | null;
  source_is_official: boolean;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  academic_year_id: string;
  academic_year_name: string;
  program_code: string;
  department_code: string;
  unit_count: number;
  created_by: string;
  creator_name: string;
  is_owner: boolean;
  approved_at: Date | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    version: s.version,
    status: s.status,
    sourceType: s.source_type,
    sourceReference: s.source_reference,
    sourceNotes: s.source_notes,
    sourceIsOfficial: s.source_is_official,
    subjectId: s.subject_id,
    subjectName: s.subject_name,
    subjectCode: s.subject_code,
    academicYearId: s.academic_year_id,
    academicYear: s.academic_year_name,
    programCode: s.program_code,
    departmentCode: s.department_code,
    unitCount: s.unit_count,
    createdBy: s.created_by,
    creatorName: s.creator_name,
    isOwner: s.is_owner,
    approvedAt: s.approved_at,
    publishedAt: s.published_at,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

function handleErr(error: unknown) {
  if (error instanceof AcademicOpsValidationError) {
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
