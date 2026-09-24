import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  createConfigChange,
  listConfigChanges,
} from "@/lib/institution-changes";

/**
 * GET  /api/institution/changes — list config change requests.
 * POST /api/institution/changes — create sensitive-area change (admin).
 * Body: { area, payload, submit? }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const changes = await listConfigChanges(ctx, {
      status: searchParams.get("status") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 50) || 50,
    });
    return NextResponse.json({
      count: changes.length,
      changes: changes.map(toPublicView),
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
    const change = await createConfigChange(ctx, {
      area: String(body.area ?? ""),
      payload:
        body.payload && typeof body.payload === "object" ? body.payload : {},
      submit: Boolean(body.submit),
    });
    return NextResponse.json({ change: toPublicView(change) }, { status: 201 });
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(c: {
  id: string;
  area: string;
  status: string;
  payload: Record<string, unknown>;
  review_note: string | null;
  created_at: Date;
  reviewed_at: Date | null;
  published_at: Date | null;
  requester_name: string;
  reviewer_name: string | null;
}) {
  return {
    id: c.id,
    area: c.area,
    status: c.status,
    payload: c.payload,
    reviewNote: c.review_note,
    createdAt: c.created_at,
    reviewedAt: c.reviewed_at,
    publishedAt: c.published_at,
    requesterName: c.requester_name,
    reviewerName: c.reviewer_name,
  };
}

function handleErr(error: unknown) {
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
