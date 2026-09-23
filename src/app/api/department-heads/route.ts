import { NextResponse } from "next/server";

import { AuthzError, getAuthContext, ROLES, requireInstitution } from "@/lib/authz";
import { assignDepartmentHead, listDepartmentHeadHistory } from "@/lib/department-head";

/**
 * POST — appoint / hand over department HOD (admin/system_admin scoped).
 * Body: { departmentId, hodId }
 * Handover closes previous (ENDED), inserts new (ACTIVE). History preserved.
 *
 * GET ?departmentId= — headship history (institution-scoped).
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    if (
      ctx.roleName !== ROLES.admin &&
      ctx.roleName !== ROLES.systemAdmin &&
      ctx.roleName !== ROLES.directorDean
    ) {
      return NextResponse.json(
        {
          error: "FORBIDDEN",
          message: "admin, system_admin, or director_dean required",
        },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      departmentId?: string;
      hodId?: string;
    };
    if (!body.departmentId || !body.hodId) {
      return NextResponse.json(
        { error: "departmentId and hodId are required" },
        { status: 400 }
      );
    }

    const result = await assignDepartmentHead(ctx, {
      departmentId: body.departmentId,
      hodId: body.hodId,
    });

    return NextResponse.json({
      previous: result.previous
        ? {
            id: result.previous.id,
            hodId: result.previous.hod_id,
            status: result.previous.status,
            validFrom: result.previous.valid_from,
            validTo: result.previous.valid_to,
          }
        : null,
      current: {
        id: result.current.id,
        hodId: result.current.hod_id,
        status: result.current.status,
        validFrom: result.current.valid_from,
        validTo: result.current.valid_to,
        hodName: result.current.hod_name,
        departmentCode: result.current.department_code,
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
      {
        error: "server_error",
        message: error instanceof Error ? error.message : "unknown",
      },
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
    requireInstitution(ctx);

    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("departmentId");
    if (!departmentId) {
      return NextResponse.json(
        { error: "departmentId query param is required" },
        { status: 400 }
      );
    }

    const history = await listDepartmentHeadHistory(ctx, departmentId);
    return NextResponse.json({
      history: history.map((h) => ({
        id: h.id,
        hodId: h.hod_id,
        hodName: h.hod_name,
        status: h.status,
        validFrom: h.valid_from,
        validTo: h.valid_to,
        departmentCode: h.department_code,
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
