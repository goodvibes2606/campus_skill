import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  listInstitutionModules,
  setInstitutionModule,
} from "@/lib/institution-modules";

/**
 * GET  /api/institution/modules — list module flags for caller's institution.
 * PATCH /api/institution/modules — set one module (admin only).
 * Body: { moduleKey, enabled }
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const modules = await listInstitutionModules(ctx);
    return NextResponse.json({ count: modules.length, modules });
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
    const updated = await setInstitutionModule(ctx, {
      moduleKey: String(body.moduleKey ?? ""),
      enabled: Boolean(body.enabled),
    });
    return NextResponse.json({ module: updated });
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
      message: error instanceof Error ? error.message : "unknown",
    },
    { status: 500 }
  );
}
