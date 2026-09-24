import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  listVisibleResources,
  createResource,
} from "@/lib/resources";
import { ResourceValidationError } from "@/lib/resource-types";

/**
 * GET  /api/resources — list resources visible to the caller (server-side filter).
 * POST /api/resources — create resource (faculty/HOD/admin with scope authz).
 *
 * Body (POST JSON):
 * {
 *   sectionId, subjectId, resourceType, title,
 *   description?, syllabusRef?, unitRef?, topicRef?, status?,
 *   upload?: { filename, mimeType, sizeBytes }
 * }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const resources = await listVisibleResources(ctx, {
      status: searchParams.get("status") ?? undefined,
      resourceType: searchParams.get("type") ?? undefined,
      sectionId: searchParams.get("sectionId") ?? undefined,
      subjectId: searchParams.get("subjectId") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 50) || 50,
    });

    return NextResponse.json({
      count: resources.length,
      resources: resources.map(toPublicView),
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
    const resource = await createResource(ctx, {
      sectionId: String(body.sectionId ?? ""),
      subjectId: String(body.subjectId ?? ""),
      resourceType: String(body.resourceType ?? ""),
      title: String(body.title ?? ""),
      description: body.description ? String(body.description) : "",
      syllabusRef: body.syllabusRef ?? null,
      unitRef: body.unitRef ?? null,
      topicRef: body.topicRef ?? null,
      status: body.status ?? "draft",
      upload: body.upload
        ? {
            filename: String(body.upload.filename ?? ""),
            mimeType: String(body.upload.mimeType ?? ""),
            sizeBytes: Number(body.upload.sizeBytes ?? 0),
          }
        : undefined,
    });

    return NextResponse.json({ resource: toPublicView(resource) }, { status: 201 });
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(r: Record<string, unknown>) {
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
