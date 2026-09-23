import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";

/**
 * Server-side session + role + institution lookup for the current user.
 * Never trusts client-supplied role data.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    return NextResponse.json({
      userId: ctx.userId,
      roleName: ctx.roleName,
      institutionId: ctx.institutionId,
      profileStatus: ctx.profileStatus,
      fullName: ctx.fullName,
      email: ctx.email,
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
