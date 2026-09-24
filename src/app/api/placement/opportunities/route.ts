import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  listOpportunities,
  createOpportunity,
} from "@/lib/placement-opportunities";
import { PlacementValidationError } from "@/lib/placement-types";
import { notifyApprovalRequired } from "@/lib/placement-notifications";

/**
 * GET  /api/placement/opportunities — role-filtered list.
 * POST /api/placement/opportunities — create (TPO / placement faculty).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const opportunities = await listOpportunities(ctx, {
      status: searchParams.get("status") ?? undefined,
      kind: searchParams.get("kind") ?? undefined,
      companyId: searchParams.get("companyId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 100) || 100,
    });
    return NextResponse.json({
      count: opportunities.length,
      opportunities: opportunities.map(toPublicView),
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
    const eligibility = Array.isArray(body.eligibility)
      ? body.eligibility.map((row: Record<string, unknown>) => ({
          departmentId: row.departmentId ? String(row.departmentId) : null,
          programId: row.programId ? String(row.programId) : null,
          sectionId: row.sectionId ? String(row.sectionId) : null,
          semesterFrom:
            row.semesterFrom === null || row.semesterFrom === undefined
              ? null
              : Number(row.semesterFrom),
          semesterTo:
            row.semesterTo === null || row.semesterTo === undefined
              ? null
              : Number(row.semesterTo),
          notes: row.notes ? String(row.notes) : undefined,
        }))
      : undefined;

    const opportunity = await createOpportunity(ctx, {
      companyId: String(body.companyId ?? ""),
      title: String(body.title ?? ""),
      description: body.description ? String(body.description) : undefined,
      opportunityKind: body.opportunityKind
        ? String(body.opportunityKind)
        : undefined,
      employmentType: body.employmentType
        ? String(body.employmentType)
        : undefined,
      location: body.location !== undefined ? String(body.location) : undefined,
      compensation:
        body.compensation !== undefined ? String(body.compensation) : undefined,
      applicationDeadline: body.applicationDeadline
        ? String(body.applicationDeadline)
        : null,
      interviewNotes: body.interviewNotes
        ? String(body.interviewNotes)
        : undefined,
      departmentId: body.departmentId ? String(body.departmentId) : null,
      eligibility,
      status: body.status ? String(body.status) : undefined,
    });

    if (opportunity.status === "pending_approval" && ctx.institutionId) {
      await notifyApprovalRequired(ctx, {
        institutionId: ctx.institutionId,
        kind: "opportunity",
        name: opportunity.title,
      });
    }

    return NextResponse.json(
      { opportunity: toPublicView(opportunity) },
      { status: 201 }
    );
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(o: Record<string, unknown>) {
  return {
    id: o.id,
    companyId: o.company_id,
    companyName: o.company_name,
    companyStatus: o.company_status,
    title: o.title,
    description: o.description,
    opportunityKind: o.opportunity_kind,
    employmentType: o.employment_type,
    location: o.location,
    compensation: o.compensation,
    applicationDeadline: o.application_deadline,
    interviewNotes: o.interview_notes,
    departmentId: o.department_id,
    status: o.status,
    createdBy: o.created_by,
    creatorName: o.creator_name,
    submittedAt: o.submitted_at,
    approvedBy: o.approved_by,
    approverName: o.approver_name,
    approvedAt: o.approved_at,
    rejectedBy: o.rejected_by,
    rejectedAt: o.rejected_at,
    approvalNote: o.approval_note,
    openedAt: o.opened_at,
    closedAt: o.closed_at,
    applicationCount: o.application_count ?? 0,
    eligibility: o.eligibility ?? [],
    createdAt: o.created_at,
    updatedAt: o.updated_at,
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
