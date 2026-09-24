import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { getAssignmentView, updateAssignment } from "@/lib/assignments";
import { AssessmentValidationError } from "@/lib/assessment-types";

/**
 * GET   /api/assignments/[id] — one assignment (visibility-checked).
 * PATCH /api/assignments/[id] — update content/status (owner/HOD/admin).
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
    const assignment = await getAssignmentView(auth, id);
    return NextResponse.json({ assignment: map(assignment) });
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
    const assignment = await updateAssignment(auth, id, {
      title: body.title,
      description: body.description,
      instructions: body.instructions,
      status: body.status,
      dueAt: body.dueAt,
      maxPoints: body.maxPoints,
      allowResubmit: body.allowResubmit,
    });
    return NextResponse.json({ assignment: map(assignment) });
  } catch (error) {
    return handleErr(error);
  }
}

function map(a: {
  id: string;
  title: string;
  description: string;
  instructions: string;
  status: string;
  due_at: Date | null;
  max_points: number | null;
  allow_resubmit: boolean;
  version: number;
  section_id: string;
  section_name: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  academic_year_id: string;
  academic_year_name: string;
  semester_number: number;
  owner_id: string;
  owner_name: string;
  created_by: string;
  is_owner: boolean;
  submission_count: number;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}) {
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
