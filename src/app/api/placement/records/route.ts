import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  createPlacementRecord,
  listPlacementRecords,
} from "@/lib/placement-applications";
import { PlacementValidationError } from "@/lib/placement-types";

/**
 * GET  /api/placement/records — role/own filtered placement records.
 * POST /api/placement/records — record placement (operator).
 * Body: { applicationId, joinedOn?, recordStatus?, compensation?, notes? }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const records = await listPlacementRecords(ctx, {
      mine: searchParams.get("mine") === "true",
      limit: Number(searchParams.get("limit") ?? 100) || 100,
    });
    return NextResponse.json({
      count: records.length,
      records: records.map(toPublicView),
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
    const record = await createPlacementRecord(ctx, {
      applicationId: String(body.applicationId ?? ""),
      joinedOn: body.joinedOn ? String(body.joinedOn) : null,
      recordStatus: body.recordStatus ? String(body.recordStatus) : undefined,
      compensation: body.compensation ? String(body.compensation) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
    });
    return NextResponse.json({ record: toPublicView(record) }, { status: 201 });
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(r: Record<string, unknown>) {
  return {
    id: r.id,
    studentId: r.student_id,
    studentName: r.student_name,
    opportunityId: r.opportunity_id,
    opportunityTitle: r.opportunity_title,
    companyId: r.company_id,
    companyName: r.company_name,
    applicationId: r.application_id,
    joinedOn: r.joined_on,
    recordStatus: r.record_status,
    compensation: r.compensation,
    notes: r.notes,
    recordedBy: r.recorded_by,
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
      message: error instanceof Error ? error.message : "unknown",
    },
    { status: 500 }
  );
}
