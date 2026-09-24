import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { listCompanies, createCompany } from "@/lib/placement-companies";
import { PlacementValidationError } from "@/lib/placement-types";
import { notifyApprovalRequired } from "@/lib/placement-notifications";

/**
 * GET  /api/placement/companies — list (operator/approver/oversight only).
 * POST /api/placement/companies — create (institution-wide TPO only).
 * Body: { name, website?, industry?, location?, contactName?, contactEmail?,
 *         contactPhone?, notes?, status? }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const companies = await listCompanies(ctx, {
      status: searchParams.get("status") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 100) || 100,
    });
    return NextResponse.json({
      count: companies.length,
      companies: companies.map(toPublicView),
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
    const company = await createCompany(ctx, {
      name: String(body.name ?? ""),
      website: body.website ? String(body.website) : undefined,
      industry: body.industry ? String(body.industry) : undefined,
      location: body.location ? String(body.location) : undefined,
      contactName: body.contactName ? String(body.contactName) : undefined,
      contactEmail: body.contactEmail ? String(body.contactEmail) : undefined,
      contactPhone: body.contactPhone ? String(body.contactPhone) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
      status: body.status ? String(body.status) : undefined,
    });
    if (company.status === "pending_approval" && ctx.institutionId) {
      await notifyApprovalRequired(ctx, {
        institutionId: ctx.institutionId,
        kind: "company",
        name: company.name,
      });
    }
    return NextResponse.json({ company: toPublicView(company) }, { status: 201 });
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(c: {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string;
  status: string;
  created_by: string;
  submitted_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  approval_note: string | null;
  created_at: Date;
  updated_at: Date;
  creator_name?: string;
  approver_name?: string | null;
  opportunity_count?: number;
}) {
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
