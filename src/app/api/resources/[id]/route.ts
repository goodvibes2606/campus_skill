import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { getResourceView, updateResource } from "@/lib/resources";
import { ResourceValidationError } from "@/lib/resource-types";

/**
 * GET    /api/resources/[id] — one resource (visibility-checked server-side).
 * PATCH  /api/resources/[id] — update metadata/status (owner/HOD/admin).
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const resource = await getResourceView(auth, id);
    return NextResponse.json({ resource: map(resource) });
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

    const resource = await updateResource(auth, id, {
      title: body.title,
      description: body.description,
      status: body.status,
      syllabusRef: body.syllabusRef,
      unitRef: body.unitRef,
      topicRef: body.topicRef,
    });
    return NextResponse.json({ resource: map(resource) });
  } catch (error) {
    return handleErr(error);
  }
}

function map(r: {
  id: string;
  title: string;
  description: string;
  resource_type: string;
  status: string;
  version: number;
  syllabus_ref: string | null;
  unit_ref: string | null;
  topic_ref: string | null;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  section_id: string;
  section_name: string;
  semester_number: number;
  academic_year_name: string;
  program_code: string;
  department_code: string;
  university_code: string;
  owner_id: string;
  owner_name: string;
  is_owner: boolean;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_key: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    resourceType: r.resource_type,
    status: r.status,
    version: r.version,
    syllabusRef: r.syllabus_ref,
    unitRef: r.unit_ref,
    topicRef: r.topic_ref,
    subjectId: r.subject_id,
    subjectName: r.subject_name,
    subjectCode: r.subject_code,
    sectionId: r.section_id,
    sectionName: r.section_name,
    semesterNumber: r.semester_number,
    academicYear: r.academic_year_name,
    programCode: r.program_code,
    departmentCode: r.department_code,
    universityCode: r.university_code,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    isOwner: r.is_owner,
    originalFilename: r.original_filename,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    storageKey: r.storage_key,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function handleErr(error: unknown) {
  if (error instanceof ResourceValidationError) {
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
