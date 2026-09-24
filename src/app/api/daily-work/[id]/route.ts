import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  getDailyWorkReportView,
  updateDailyWorkReport,
} from "@/lib/daily-work";
import { AcademicOpsValidationError } from "@/lib/academic-ops-types";

/**
 * GET   /api/daily-work/[id] — one report (reporter / HOD / admin only).
 * PATCH /api/daily-work/[id] — submit / acknowledge / return / edit summary.
 *
 * Body: { summary?, status?, returnNote? }
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
    const report = await getDailyWorkReportView(auth, id);
    return NextResponse.json({ report: map(report) });
  } catch (error) {
    return handleErr(error);
  }
}

export async function PATCH(
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
    const report = await updateDailyWorkReport(auth, id, {
      summary: body.summary,
      status: body.status,
      returnNote: body.returnNote,
    });
    return NextResponse.json({ report: map(report) });
  } catch (error) {
    return handleErr(error);
  }
}

function map(r: {
  id: string;
  report_date: string | Date;
  summary: string;
  status: string;
  department_id: string | null;
  department_code: string | null;
  reporter_id: string;
  reporter_name: string;
  is_reporter: boolean;
  return_note: string | null;
  acknowledged_at: Date | null;
  created_at: Date;
  updated_at: Date;
  items: Array<{
    id: string;
    work_type: string;
    description: string;
    subject_id: string | null;
    section_id: string | null;
    duration_minutes: number | null;
  }>;
}) {
  return {
    id: r.id,
    reportDate: r.report_date,
    summary: r.summary,
    status: r.status,
    departmentId: r.department_id,
    departmentCode: r.department_code,
    reporterId: r.reporter_id,
    reporterName: r.reporter_name,
    isReporter: r.is_reporter,
    returnNote: r.return_note,
    acknowledgedAt: r.acknowledged_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    items: r.items.map((item) => ({
      id: item.id,
      workType: item.work_type,
      description: item.description,
      subjectId: item.subject_id,
      sectionId: item.section_id,
      durationMinutes: item.duration_minutes,
    })),
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
      message: "Something went wrong. Try again.",
    },
    { status: 500 }
  );
}
