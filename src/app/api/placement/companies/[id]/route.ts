import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { getCompany, updateCompany } from "@/lib/placement-companies";
import { PlacementValidationError } from "@/lib/placement-types";
import { notifyApprovalRequired } from "@/lib/placement-notifications";

type Params = { params: Promise<{ id: string }> };

/** GET /api/placement/companies/[id] */
export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await params;
    const company = await getCompany(ctx, id);
    return NextResponse.json({ company: toPublicView(company) });
  } catch (error) {
    return handleErr(error);
  }
}

/** PATCH /api/placement/companies/[id] — content edit or status transition. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const input: Record<string, unknown> = {};
    if (body.name !== undefined) input.name = String(body.name);
    if (body.website !== undefined) input.website = String(body.website);
    if (body.industry !== undefined) input.industry = String(body.industry);
    if (body.location !== undefined) input.location = String(body.location);
    if (body.contactName !== undefined) input.contactName = String(body.contactName);
    if (body.contactEmail !== undefined) input.contactEmail = String(body.contactEmail);
    if (body.contactPhone !== undefined) input.contactPhone = String(body.contactPhone);
    if (body.notes !== undefined) input.notes = String(body.notes);
    if (body.status !== undefined) input.status = String(body.status);
    if (body.note !== undefined) input.note = String(body.note);

    const company = await updateCompany(ctx, id, input);
    if (
      company.status === "pending_approval" &&
      ctx.institutionId &&
      typeof body.status === "string"
    ) {
      await notifyApprovalRequired(ctx, {
        institutionId: ctx.institutionId,
        kind: "company",
        name: company.name,
      });
    }
    return NextResponse.json({ company: toPublicView(company) });
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(c: Record<string, unknown>) {
  return {
    id: c.id,
    name: c.name,
    website: c.website,
    industry: c.industry,
    location: c.location,
    contactName: c.contact_name,
    contactEmail: c.contact_email,
    contactPhone: c.contact_phone,
    notes: c.notes,
    status: c.status,
    createdBy: c.created_by,
    creatorName: c.creator_name,
    submittedAt: c.submitted_at,
    approvedBy: c.approved_by,
    approverName: c.approver_name,
    approvedAt: c.approved_at,
    rejectedBy: c.rejected_by,
    rejectedAt: c.rejected_at,
    approvalNote: c.approval_note,
    opportunityCount: c.opportunity_count ?? 0,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
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
