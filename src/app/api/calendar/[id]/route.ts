import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  getCalendarEventView,
  updateCalendarEvent,
} from "@/lib/calendar";
import { AcademicOpsValidationError } from "@/lib/academic-ops-types";

/**
 * GET   /api/calendar/[id] — one event (visibility-checked).
 * PATCH /api/calendar/[id] — edit draft content and/or approval lifecycle.
 *
 * Body: { title?, description?, eventType?, startsOn?, endsOn?, status?, approvalNote? }
 * Status transitions drive approval/circulation foundation.
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
    const event = await getCalendarEventView(auth, id);
    return NextResponse.json({ event: map(event) });
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
    const event = await updateCalendarEvent(auth, id, {
      title: body.title,
      description: body.description,
      eventType: body.eventType,
      startsOn: body.startsOn,
      endsOn: body.endsOn,
      status: body.status,
      approvalNote: body.approvalNote,
    });
    return NextResponse.json({ event: map(event) });
  } catch (error) {
    return handleErr(error);
  }
}

function map(e: {
  id: string;
  title: string;
  description: string;
  event_type: string;
  starts_on: string | Date;
  ends_on: string | Date;
  status: string;
  department_id: string | null;
  department_code: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  created_by: string;
  creator_name: string;
  is_creator: boolean;
  approval_note: string | null;
  approved_at: Date | null;
  rejected_at: Date | null;
  circulated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}) {
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
