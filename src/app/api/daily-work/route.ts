import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  listDailyWorkReports,
  createDailyWorkReport,
} from "@/lib/daily-work";
import { AcademicOpsValidationError } from "@/lib/academic-ops-types";

/**
 * GET  /api/daily-work — reports visible to caller (own / HOD dept / admin).
 * POST /api/daily-work — create own daily work report (faculty/HOD/admin).
 *
 * Body (POST):
 * {
 *   reportDate: "YYYY-MM-DD",
 *   summary?,
 *   status?: "draft" | "submitted",
 *   items?: [{ workType?, description, subjectId?, sectionId?, durationMinutes? }]
 * }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const reports = await listDailyWorkReports(ctx, {
      reporterId: searchParams.get("reporterId") ?? undefined,
      date: searchParams.get("date") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      departmentId: searchParams.get("departmentId") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 50) || 50,
    });
    return NextResponse.json({
      count: reports.length,
      reports: reports.map(toPublicView),
    });
  } catch (error) {
    return handleErr(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const body = await request.json();
    const report = await createDailyWorkReport(ctx, {
      reportDate: String(body.reportDate ?? ""),
      summary: body.summary ? String(body.summary) : "",
      status: body.status ?? undefined,
      items: Array.isArray(body.items)
        ? body.items.map(
            (item: {
              workType?: string;
              description?: string;
              subjectId?: string | null;
              sectionId?: string | null;
              durationMinutes?: number | null;
            }) => ({
              workType: item.workType,
              description: String(item.description ?? ""),
              subjectId: item.subjectId || null,
              sectionId: item.sectionId || null,
              durationMinutes: item.durationMinutes ?? null,
            })
          )
        : [],
    });
    return NextResponse.json(
      { report: toPublicView(report) },
      { status: 201 }
    );
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(r: Record<string, unknown>) {
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
    items: Array.isArray(r.items)
      ? r.items.map(
          (item: Record<string, unknown>) => ({
            id: item.id,
            workType: item.work_type,
            description: item.description,
            subjectId: item.subject_id,
            sectionId: item.section_id,
            durationMinutes: item.duration_minutes,
          })
        )
      : [],
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
