import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  createInterview,
  updateInterview,
  listInterviews,
} from "@/lib/placement-applications";
import { PlacementValidationError } from "@/lib/placement-types";
import { notifyInterviewScheduled } from "@/lib/placement-notifications";

/**
 * GET  /api/placement/interviews — role/own filtered.
 * POST /api/placement/interviews — schedule (operator).
 * PATCH via /api/placement/interviews with { id, status?, outcome?, ... }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const interviews = await listInterviews(ctx, {
      mine: searchParams.get("mine") === "true",
      status: searchParams.get("status") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 100) || 100,
    });
    return NextResponse.json({
      count: interviews.length,
      interviews: interviews.map(toPublicView),
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
    const mode = String(body.mode ?? "online");
    const interview = await createInterview(ctx, {
      applicationId: String(body.applicationId ?? ""),
      scheduledAt: body.scheduledAt ? String(body.scheduledAt) : null,
      mode,
      locationOrLink: body.locationOrLink
        ? String(body.locationOrLink)
        : undefined,
      notes: body.notes ? String(body.notes) : undefined,
    });
    await notifyStudentInterview(ctx, interview);
    return NextResponse.json(
      { interview: toPublicView(interview) },
      { status: 201 }
    );
  } catch (error) {
    return handleErr(error);
  }
}

/** PATCH body: { id, status?, outcome?, scheduledAt?, notes? } */
export async function PATCH(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const body = await request.json();
    const id = String(body.id ?? "");
    const interview = await updateInterview(ctx, id, {
      status: body.status !== undefined ? String(body.status) : undefined,
      outcome:
        body.outcome !== undefined
          ? body.outcome === null
            ? null
            : String(body.outcome)
          : undefined,
      scheduledAt:
        body.scheduledAt !== undefined
          ? body.scheduledAt
            ? String(body.scheduledAt)
            : null
          : undefined,
      notes: body.notes !== undefined ? String(body.notes) : undefined,
    });
    return NextResponse.json({ interview: toPublicView(interview) });
  } catch (error) {
    return handleErr(error);
  }
}

async function notifyStudentInterview(
  ctx: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>,
  interview: Awaited<ReturnType<typeof createInterview>>
) {
  if (!ctx.institutionId) return;
  const { pool } = await import("@/lib/db");
  const r = await pool.query<{
    student_id: string;
    title: string;
  }>(
    `SELECT a.student_id, o.title
       FROM public.placement_applications a
       JOIN public.placement_opportunities o ON o.id = a.opportunity_id
      WHERE a.id = $1`,
    [interview.application_id]
  );
  const row = r.rows[0];
  if (!row) return;
  await notifyInterviewScheduled(ctx, {
    studentId: row.student_id,
    institutionId: ctx.institutionId,
    title: row.title,
    when: interview.scheduled_at
      ? new Date(interview.scheduled_at).toLocaleString()
      : "a time to be confirmed",
  });
}

function toPublicView(i: Record<string, unknown>) {
  return {
    id: i.id,
    applicationId: i.application_id,
    studentName: i.student_name,
    opportunityTitle: i.opportunity_title,
    companyName: i.company_name,
    applicationStatus: i.application_status,
    scheduledAt: i.scheduled_at,
    mode: i.mode,
    locationOrLink: i.location_or_link,
    notes: i.notes,
    status: i.status,
    outcome: i.outcome,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
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
