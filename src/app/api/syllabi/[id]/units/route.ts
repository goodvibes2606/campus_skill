import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { listUnits, createUnit } from "@/lib/syllabus";
import { AcademicOpsValidationError } from "@/lib/academic-ops-types";

/**
 * GET  /api/syllabi/[id]/units — list units for a syllabus.
 * POST /api/syllabi/[id]/units — add unit (editor roles only).
 *
 * Body: { unitNumber?, title, description? }
 */
export async function GET(
  _request: Request,
  routeCtx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await routeCtx.params;
    const units = await listUnits(auth, id);
    return NextResponse.json({
      count: units.length,
      units: units.map(mapUnit),
    });
  } catch (error) {
    return handleErr(error);
  }
}

export async function POST(
  request: Request,
  routeCtx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await routeCtx.params;
    const body = await request.json();
    const unit = await createUnit(auth, id, {
      unitNumber:
        body.unitNumber === undefined || body.unitNumber === null
          ? undefined
          : Number(body.unitNumber),
      title: String(body.title ?? ""),
      description: body.description ? String(body.description) : "",
    });
    return NextResponse.json({ unit: mapUnit(unit) }, { status: 201 });
  } catch (error) {
    return handleErr(error);
  }
}

function mapUnit(u: {
  id: string;
  syllabus_id: string;
  unit_number: number;
  title: string;
  description: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: u.id,
    syllabusId: u.syllabus_id,
    unitNumber: u.unit_number,
    title: u.title,
    description: u.description,
    status: u.status,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  };
}

function handleErr(error: unknown) {
  if (error instanceof AcademicOpsValidationError) {
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
      message: error instanceof Error ? error.message : "unknown",
    },
    { status: 500 }
  );
}
