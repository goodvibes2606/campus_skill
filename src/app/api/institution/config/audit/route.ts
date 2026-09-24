import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { InstitutionConfigValidationError, listConfigAudit } from "@/lib/institution-config";
import {
  assertCanReadInstitutionWorkspace,
  getInstitutionWorkspaceScope,
} from "@/lib/institution-scope";

/**
 * GET /api/institution/config/audit — institution config audit trail.
 * Access: institution admin, Director/Dean, system_admin (read).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const scope = await getInstitutionWorkspaceScope(ctx);
    assertCanReadInstitutionWorkspace(scope);
    if (!scope.canViewAudit) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Audit not available for your role" },
        { status: 403 }
      );
    }
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? 50) || 50;
    const rows = await listConfigAudit(ctx, limit);
    return NextResponse.json({
      count: rows.length,
      audit: rows.map(toPublicView),
    });
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(r: {
  id: string;
  area: string;
  action: string;
  status: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: Date;
  changed_by_name: string;
}) {
  return {
    id: r.id,
    area: r.area,
    action: r.action,
    status: r.status,
    previousValue: r.previous_value,
    newValue: r.new_value,
    createdAt: r.created_at,
    changedByName: r.changed_by_name,
  };
}

function handleErr(error: unknown) {
  if (error instanceof InstitutionConfigValidationError) {
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
      message: "Something went wrong. Try again.",
    },
    { status: 500 }
  );
}
