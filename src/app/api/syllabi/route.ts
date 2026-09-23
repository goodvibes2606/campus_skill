import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { listVisibleSyllabi, createSyllabus } from "@/lib/syllabus";
import { AcademicOpsValidationError } from "@/lib/academic-ops-types";

/**
 * GET  /api/syllabi — list syllabi visible to caller (server-side filter).
 * POST /api/syllabi — create syllabus (faculty/HOD/admin with scope).
 *
 * Body (POST):
 * {
 *   subjectId, academicYearId, title,
 *   description?, sourceType?, sourceReference?, sourceNotes?, sourceIsOfficial?
 * }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const syllabi = await listVisibleSyllabi(ctx, {
      status: searchParams.get("status") ?? undefined,
      subjectId: searchParams.get("subjectId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 50) || 50,
    });
    return NextResponse.json({
      count: syllabi.length,
      syllabi: syllabi.map(toPublicView),
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
    const syllabus = await createSyllabus(ctx, {
      subjectId: String(body.subjectId ?? ""),
      academicYearId: String(body.academicYearId ?? ""),
      title: String(body.title ?? ""),
      description: body.description ? String(body.description) : "",
      sourceType: body.sourceType ?? undefined,
      sourceReference: body.sourceReference ?? null,
      sourceNotes: body.sourceNotes ?? null,
      sourceIsOfficial: body.sourceIsOfficial === true,
    });
    return NextResponse.json(
      { syllabus: toPublicView(syllabus) },
      { status: 201 }
    );
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(s: Record<string, unknown>) {
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
      message: error instanceof Error ? error.message : "unknown",
    },
    { status: 500 }
  );
}
