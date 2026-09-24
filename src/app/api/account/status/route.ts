import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/authz";
import { mapApiError, unauthenticated } from "@/lib/api-errors";
import {
  ACCOUNT_STATUSES,
  listAccounts,
  setAccountStatus,
  type AccountStatus,
} from "@/lib/account-lifecycle";

/**
 * GET  /api/account/status — list accounts (admin/director/system_admin).
 * PATCH /api/account/status — change one account lifecycle status.
 * Query: ?status=suspended&limit=100
 * Body:  { userId, status, reason? }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const limit = Number(searchParams.get("limit") ?? 100) || 100;
    const users = await listAccounts(ctx, {
      status: statusParam ?? undefined,
      limit,
    });
    return NextResponse.json({ count: users.length, users });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const body = (await request.json()) as {
      userId?: string;
      status?: string;
      reason?: string;
    };
    if (!body.userId || typeof body.userId !== "string") {
      return NextResponse.json(
        { error: "VALIDATION", message: "userId is required" },
        { status: 400 }
      );
    }
    if (
      !body.status ||
      !(ACCOUNT_STATUSES as readonly string[]).includes(body.status)
    ) {
      return NextResponse.json(
        {
          error: "VALIDATION",
          message: `status must be one of: ${ACCOUNT_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }
    const updated = await setAccountStatus(
      ctx,
      body.userId,
      body.status as AccountStatus,
      body.reason
    );
    return NextResponse.json({ user: updated });
  } catch (error) {
    return mapApiError(error);
  }
}
