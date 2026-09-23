import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  getOpportunity,
  updateOpportunity,
} from "@/lib/placement-opportunities";
import { PlacementValidationError } from "@/lib/placement-types";
import {
  notifyApprovalRequired,
  notifyOpportunityOpened,
} from "@/lib/placement-notifications";

type Params = { params: Promise<{ id: string }> };

/** GET /api/placement/opportunities/[id] */
export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await params;
    const opportunity = await getOpportunity(ctx, id);
    return NextResponse.json({ opportunity: toPublicView(opportunity) });
  } catch (error) {
    return handleErr(error);
  }
}

/** PATCH /api/placement/opportunities/[id] — content edit or status transition. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();

    const input: Record<string, unknown> = {};
    if (body.title !== undefined) input.title = String(body.title);
    if (body.description !== undefined) input.description = String(body.description);
    if (body.location !== undefined) input.location = String(body.location);
    if (body.compensation !== undefined) input.compensation = String(body.compensation);
    if (body.applicationDeadline !== undefined) {
      input.applicationDeadline = body.applicationDeadline
        ? String(body.applicationDeadline)
        : null;
    }
    if (body.interviewNotes !== undefined) {
      input.interviewNotes = String(body.interviewNotes);
    }
    if (body.employmentType !== undefined) {
      input.employmentType = body.employmentType
        ? String(body.employmentType)
        : null;
    }
    if (body.status !== undefined) input.status = String(body.status);
    if (body.note !== undefined) input.note = String(body.note);
    if (Array.isArray(body.eligibility)) {
      input.eligibility = body.eligibility.map(
        (row: Record<string, unknown>) => ({
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
        })
      );
    }

    const opportunity = await updateOpportunity(ctx, id, input);

    if (
      opportunity.status === "pending_approval" &&
      ctx.institutionId &&
      typeof body.status === "string"
    ) {
      await notifyApprovalRequired(ctx, {
        institutionId: ctx.institutionId,
        kind: "opportunity",
        name: opportunity.title,
      });
    }
    if (
      opportunity.status === "open" &&
      ctx.institutionId &&
      typeof body.status === "string"
    ) {
      await notifyOpportunityOpened(ctx, {
        institutionId: ctx.institutionId,
        title: opportunity.title,
        opportunityId: opportunity.id,
      });
    }

    return NextResponse.json({ opportunity: toPublicView(opportunity) });
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
      message: error instanceof Error ? error.message : "unknown",
    },
    { status: 500 }
  );
}
