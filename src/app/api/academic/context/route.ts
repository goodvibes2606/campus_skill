import { NextResponse } from "next/server";

import { AuthzError, getAuthContext, ROLES } from "@/lib/authz";
import { getAcademicScope } from "@/lib/academic-scope";

/**
 * Server-side academic context for the current user.
 * Returns role-specific academic scope (enrollment, assignments, headships).
 * Never trusts client-supplied academic data.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const scope = await getAcademicScope(ctx);

    // Trim payloads per role for clarity
    const payload: Record<string, unknown> = {
      userId: ctx.userId,
      roleName: ctx.roleName,
      institutionId: ctx.institutionId,
    };

    if (ctx.roleName === ROLES.student) {
      payload.enrollment = scope.enrollment;
    } else if (
      ctx.roleName === ROLES.faculty ||
      ctx.roleName === ROLES.hod
    ) {
      payload.facultyAssignments = scope.facultyAssignments;
      payload.coordinatorSections = scope.coordinatorSections;
      if (ctx.roleName === ROLES.hod) {
        payload.headships = scope.headships;
      }
    } else {
      // admin / system_admin / director — institution scope only
      payload.facultyAssignments = [];
      payload.headships = [];
      payload.enrollment = null;
      payload.coordinatorSections = [];
    }

    return NextResponse.json(payload);
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
