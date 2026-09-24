import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  getConfigChange,
  transitionConfigChange,
} from "@/lib/institution-changes";

/**
 * GET    /api/institution/changes/[id] — one change request.
 * PATCH  /api/institution/changes/[id] — transition status.
 * Body: { status: in_review|approved|rejected|published, note? }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await params;
    const change = await getConfigChange(ctx, id);
    return NextResponse.json({ change });
  } catch (error) {
    return handleErr(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const status = String(body.status ?? "");
    if (
      !["in_review", "approved", "rejected", "published", "draft"].includes(
        status
      )
    ) {
      return NextResponse.json(
        { error: "VALIDATION", message: "Invalid status" },
        { status: 400 }
      );
    }
    const change = await transitionConfigChange(
      ctx,
      id,
      status as never,
      body.note ? String(body.note) : undefined
    );
    return NextResponse.json({ change });
  } catch (error) {
    return handleErr(error);
  }
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
