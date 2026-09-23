import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  createOffer,
  updateOffer,
  listOffers,
} from "@/lib/placement-applications";
import { PlacementValidationError } from "@/lib/placement-types";
import { notifyOfferReceived } from "@/lib/placement-notifications";

/**
 * GET  /api/placement/offers — role/own filtered.
 * POST /api/placement/offers — create offer (operator).
 * PATCH body: { id, offerStatus?, joiningDate?, notes? }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const offers = await listOffers(ctx, {
      mine: searchParams.get("mine") === "true",
      offerStatus: searchParams.get("status") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 100) || 100,
    });
    return NextResponse.json({
      count: offers.length,
      offers: offers.map(toPublicView),
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
    const offer = await createOffer(ctx, {
      applicationId: String(body.applicationId ?? ""),
      offeredOn: body.offeredOn ? String(body.offeredOn) : null,
      joiningDate: body.joiningDate ? String(body.joiningDate) : null,
      compensation: body.compensation ? String(body.compensation) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
    });
    if (ctx.institutionId) {
      const { pool } = await import("@/lib/db");
      const r = await pool.query<{ student_id: string; title: string }>(
        `SELECT a.student_id, o.title
           FROM public.placement_applications a
           JOIN public.placement_opportunities o ON o.id = a.opportunity_id
          WHERE a.id = $1`,
        [offer.application_id]
      );
      const row = r.rows[0];
      if (row) {
        await notifyOfferReceived(ctx, {
          studentId: row.student_id,
          institutionId: ctx.institutionId,
          title: row.title,
          compensation: offer.compensation,
        });
      }
    }
    return NextResponse.json({ offer: toPublicView(offer) }, { status: 201 });
  } catch (error) {
    return handleErr(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const body = await request.json();
    const id = String(body.id ?? "");
    const offer = await updateOffer(ctx, id, {
      offerStatus:
        body.offerStatus !== undefined ? String(body.offerStatus) : undefined,
      joiningDate:
        body.joiningDate !== undefined
          ? body.joiningDate
            ? String(body.joiningDate)
            : null
          : undefined,
      notes: body.notes !== undefined ? String(body.notes) : undefined,
    });
    return NextResponse.json({ offer: toPublicView(offer) });
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(o: Record<string, unknown>) {
  return {
    id: o.id,
    applicationId: o.application_id,
    studentName: o.student_name,
    opportunityTitle: o.opportunity_title,
    companyName: o.company_name,
    applicationStatus: o.application_status,
    offerStatus: o.offer_status,
    offeredOn: o.offered_on,
    joiningDate: o.joining_date,
    compensation: o.compensation,
    notes: o.notes,
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
