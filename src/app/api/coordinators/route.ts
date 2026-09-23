import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  assertCanAssignCoordinator,
} from "@/lib/academic-scope";
import {
  assignCoordinator,
  getActiveCoordinator,
  listCoordinatorHistory,
} from "@/lib/coordinator";

/**
 * POST — assign / hand over class coordinator (HOD/admin scoped).
 * Body: { sectionId, coordinatorId }
 * Handover closes the previous assignment (ENDED) and opens a new one (ACTIVE).
 * History is never overwritten.
 *
 * GET ?sectionId= — coordinator history for a section (auth required).
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const body = (await request.json()) as {
      sectionId?: string;
      coordinatorId?: string;
    };
    if (!body.sectionId || !body.coordinatorId) {
      return NextResponse.json(
        { error: "sectionId and coordinatorId are required" },
        { status: 400 }
      );
    }

    await assertCanAssignCoordinator(ctx, body.sectionId);
    const result = await assignCoordinator(ctx, {
      sectionId: body.sectionId,
      coordinatorId: body.coordinatorId,
    });

    return NextResponse.json({
      previous: result.previous
        ? {
            id: result.previous.id,
            coordinatorId: result.previous.coordinator_id,
            status: result.previous.status,
            validFrom: result.previous.valid_from,
            validTo: result.previous.valid_to,
          }
        : null,
      current: {
        id: result.current.id,
        coordinatorId: result.current.coordinator_id,
        status: result.current.status,
        validFrom: result.current.valid_from,
        validTo: result.current.valid_to,
        coordinatorName: result.current.coordinator_name,
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }
    return NextResponse.json(
      { error: "server_error", message: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get("sectionId");
    if (!sectionId) {
      return NextResponse.json(
        { error: "sectionId query param is required" },
        { status: 400 }
      );
    }

    const history = await listCoordinatorHistory(ctx, sectionId);
    const active = await getActiveCoordinator(sectionId);

    return NextResponse.json({
      active: active
        ? {
            id: active.id,
            coordinatorId: active.coordinator_id,
            coordinatorName: active.coordinator_name,
            status: active.status,
            validFrom: active.valid_from,
            validTo: active.valid_to,
          }
        : null,
      history: history.map((h) => ({
        id: h.id,
        coordinatorId: h.coordinator_id,
        coordinatorName: h.coordinator_name,
        status: h.status,
        validFrom: h.valid_from,
        validTo: h.valid_to,
        assignedBy: h.assigned_by,
      })),
    });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
