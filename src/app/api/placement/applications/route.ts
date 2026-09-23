import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  listApplications,
  createApplication,
} from "@/lib/placement-applications";
import { PlacementValidationError } from "@/lib/placement-types";
import { notifyApplicationSubmitted } from "@/lib/placement-notifications";

/**
 * GET  /api/placement/applications — role/own-data filtered.
 * POST /api/placement/applications — student applies.
 * Body: { opportunityId, coverNote? }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const applications = await listApplications(ctx, {
      status: searchParams.get("status") ?? undefined,
      opportunityId: searchParams.get("opportunityId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      mine: searchParams.get("mine") === "true",
      limit: Number(searchParams.get("limit") ?? 100) || 100,
    });
    return NextResponse.json({
      count: applications.length,
      applications: applications.map(toPublicView),
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
    const application = await createApplication(ctx, {
      opportunityId: String(body.opportunityId ?? ""),
      coverNote: body.coverNote ? String(body.coverNote) : undefined,
    });
    if (ctx.institutionId) {
      await notifyApplicationSubmitted(ctx, {
        institutionId: ctx.institutionId,
        title: application.opportunity_title,
        studentName: application.student_name,
      });
    }
    return NextResponse.json(
      { application: toPublicView(application) },
      { status: 201 }
    );
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
    updatedBy: a.updated_by,
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
