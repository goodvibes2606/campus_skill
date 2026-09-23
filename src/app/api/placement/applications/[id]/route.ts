import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  getApplication,
  transitionApplication,
  listApplicationEvents,
} from "@/lib/placement-applications";
import { PlacementValidationError } from "@/lib/placement-types";
import { notifyApplicationStatus } from "@/lib/placement-notifications";

type Params = { params: Promise<{ id: string }> };

/** GET /api/placement/applications/[id] — own/scope-checked detail + history. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await params;
    const application = await getApplication(ctx, id);
    const events = await listApplicationEvents(ctx, id);
    return NextResponse.json({
      application: toPublicView(application),
      events: events.map((e) => ({
        id: e.id,
        fromStatus: e.from_status,
        toStatus: e.to_status,
        actorId: e.actor_id,
        actorName: e.actor_name,
        note: e.note,
        createdAt: e.created_at,
      })),
    });
  } catch (error) {
    return handleErr(error);
  }
}

/** PATCH /api/placement/applications/[id] — status transition. Body: { status, note? } */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const status = String(body.status ?? "");
    const application = await transitionApplication(
      ctx,
      id,
      status,
      body.note ? String(body.note) : undefined
    );
    if (application.is_own) {
      // Student acted on own application — no self-notify needed beyond status.
    } else if (ctx.institutionId) {
      await notifyApplicationStatus(ctx, {
        studentId: application.student_id,
        institutionId: ctx.institutionId,
        title: application.opportunity_title,
        status: application.status,
      });
    }
    return NextResponse.json({ application: toPublicView(application) });
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(a: Record<string, unknown>) {
  return {
    id: a.id,
    opportunityId: a.opportunity_id,
    studentId: a.student_id,
    studentName: a.student_name,
    studentEmail: a.student_email,
    status: a.status,
    coverNote: a.cover_note,
    submittedAt: a.submitted_at,
    decidedAt: a.decided_at,
    opportunityTitle: a.opportunity_title,
    opportunityKind: a.opportunity_kind,
    opportunityStatus: a.opportunity_status,
    opportunityDeadline: a.opportunity_deadline,
    companyId: a.company_id,
    companyName: a.company_name,
    isOwn: a.is_own ?? false,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
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
      message: error instanceof Error ? error.message : "unknown",
    },
    { status: 500 }
  );
}
