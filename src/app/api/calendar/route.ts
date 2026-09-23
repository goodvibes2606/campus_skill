import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { listCalendarEvents, createCalendarEvent } from "@/lib/calendar";
import { AcademicOpsValidationError } from "@/lib/academic-ops-types";

/**
 * GET  /api/calendar — institutional calendar events (server-side visible).
 * POST /api/calendar — create draft event (faculty/HOD/admin scoped).
 *
 * Body (POST):
 * {
 *   title, description?, eventType?, startsOn, endsOn,
 *   academicYearId?, departmentId?
 * }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const events = await listCalendarEvents(ctx, {
      status: searchParams.get("status") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 50) || 50,
    });
    return NextResponse.json({
      count: events.length,
      events: events.map(toPublicView),
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
    const event = await createCalendarEvent(ctx, {
      title: String(body.title ?? ""),
      description: body.description ? String(body.description) : "",
      eventType: body.eventType ?? undefined,
      startsOn: String(body.startsOn ?? ""),
      endsOn: String(body.endsOn ?? ""),
      academicYearId: body.academicYearId || null,
      departmentId: body.departmentId || null,
    });
    return NextResponse.json(
      { event: toPublicView(event) },
      { status: 201 }
    );
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(e: Record<string, unknown>) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    eventType: e.event_type,
    startsOn: e.starts_on,
    endsOn: e.ends_on,
    status: e.status,
    departmentId: e.department_id,
    departmentCode: e.department_code,
    academicYearId: e.academic_year_id,
    academicYear: e.academic_year_name,
    createdBy: e.created_by,
    creatorName: e.creator_name,
    isCreator: e.is_creator,
    approvalNote: e.approval_note,
    approvedAt: e.approved_at,
    rejectedAt: e.rejected_at,
    circulatedAt: e.circulated_at,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
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
