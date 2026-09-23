import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  decidePlacementResponsibility,
  endPlacementResponsibility,
} from "@/lib/placement-appointments";
import { PlacementValidationError } from "@/lib/placement-types";
import { notifyAppointmentDecided } from "@/lib/placement-notifications";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/placement/appointments/[id]
 * Body: { decision: "approve"|"reject", note? }  — Director/Dean only
 *   or: { decision: "end", note? }               — end active appointment
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const decision = String(body.decision ?? "");
    const note = body.note ? String(body.note) : undefined;

    if (decision === "end") {
      const current = await endPlacementResponsibility(ctx, id, note);
      if (ctx.institutionId) {
        await notifyAppointmentDecided(ctx, {
          personId: current.person_id,
          institutionId: ctx.institutionId,
          responsibility: current.responsibility,
          decision: "ended",
        });
      }
      return NextResponse.json({ appointment: { id: current.id, status: current.status } });
    }

    if (decision !== "approve" && decision !== "reject") {
      return NextResponse.json(
        { error: "VALIDATION", message: "decision must be approve, reject, or end" },
        { status: 400 }
      );
    }

    const result = await decidePlacementResponsibility(ctx, id, decision, note);
    if (ctx.institutionId) {
      await notifyAppointmentDecided(ctx, {
        personId: result.current.person_id,
        institutionId: ctx.institutionId,
        responsibility: result.current.responsibility,
        decision: decision === "approve" ? "approved" : "rejected",
      });
    }
    return NextResponse.json({
      appointment: {
        id: result.current.id,
        status: result.current.status,
        previousId: result.previous?.id ?? null,
        previousStatus: result.previous?.status ?? null,
      },
    });
  } catch (error) {
    return handleErr(error);
  }
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
