import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  listPlacementResponsibilities,
  createPlacementResponsibility,
} from "@/lib/placement-appointments";
import { PlacementValidationError } from "@/lib/placement-types";
import { notifyAppointmentRequested } from "@/lib/placement-notifications";

/**
 * GET  /api/placement/appointments — appointment history (role-filtered).
 * POST /api/placement/appointments — request pending appointment
 *      (Director/Dean or institution admin).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const rows = await listPlacementResponsibilities(ctx, {
      status: searchParams.get("status") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 100) || 100,
    });
    return NextResponse.json({
      count: rows.length,
      appointments: rows.map(toPublicView),
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
    const appointment = await createPlacementResponsibility(ctx, {
      personId: String(body.personId ?? ""),
      responsibility: String(body.responsibility ?? ""),
      responsibilityTitle: body.responsibilityTitle
        ? String(body.responsibilityTitle)
        : undefined,
      departmentId: body.departmentId ? String(body.departmentId) : null,
      programId: body.programId ? String(body.programId) : null,
      scopeNotes: body.scopeNotes ? String(body.scopeNotes) : undefined,
      startsOn: body.startsOn ? String(body.startsOn) : null,
    });
    if (ctx.institutionId) {
      await notifyAppointmentRequested(ctx, {
        institutionId: ctx.institutionId,
        personName: appointment.person_name,
        responsibility: appointment.responsibility,
      });
    }
    return NextResponse.json(
      { appointment: toPublicView(appointment) },
      { status: 201 }
    );
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(r: Record<string, unknown>) {
  return {
    id: r.id,
    institutionId: r.institution_id,
    personId: r.person_id,
    personName: r.person_name,
    personEmail: r.person_email,
    personRole: r.person_role,
    responsibility: r.responsibility,
    responsibilityTitle: r.responsibility_title,
    departmentId: r.department_id,
    departmentName: r.department_name,
    departmentCode: r.department_code,
    programId: r.program_id,
    programName: r.program_name,
    scopeNotes: r.scope_notes,
    requestedBy: r.requested_by,
    appointedBy: r.appointed_by,
    approvedBy: r.approved_by,
    approverName: r.approver_name,
    appointerName: r.appointer_name,
    approvedAt: r.approved_at,
    decisionNote: r.decision_note,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function handleErr(error: unknown) {
  if (error instanceof PlacementValidationError) {
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
