import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  listInstitutionUsers,
  loadInstitutionStructure,
} from "@/lib/institution-directory";

/**
 * GET /api/institution/users — users directory for caller's institution.
 * GET query ?view=structure — academic structure counts.
 * Access: institution admin, Director/Dean, system_admin (read).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    if (searchParams.get("view") === "structure") {
      const structure = await loadInstitutionStructure(ctx);
      return NextResponse.json({ structure });
    }
    const users = await listInstitutionUsers(ctx, {
      search: searchParams.get("search") ?? undefined,
      role: searchParams.get("role") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 100) || 100,
    });
    return NextResponse.json({
      count: users.length,
      users: users.map((u) => ({
        id: u.id,
        fullName: u.full_name,
        email: u.email,
        status: u.status,
        roleName: u.role_name,
        departmentName: u.department_name,
      })),
    });
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
