import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/authz";
import { mapApiError, unauthenticated } from "@/lib/api-errors";
import {
  createImportJob,
  listImportJobs,
  type ImportEntityType,
} from "@/lib/import-engine";

const ENTITY_TYPES: ImportEntityType[] = [
  "students",
  "faculty",
  "departments",
  "programs",
  "subjects",
  "sections",
  "structure",
];

/**
 * GET  /api/import — recent import jobs for caller's institution.
 * POST /api/import — create + validate a CSV or XLSX import job.
 * Body: { entityType, filename, csvText? , xlsxBase64?, format? }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? 30) || 30;
    const jobs = await listImportJobs(ctx, limit);
    return NextResponse.json({
      count: jobs.length,
      jobs: jobs.map((j) => ({
        id: j.id,
        entityType: j.entity_type,
        status: j.status,
        originalFilename: j.original_filename,
        totalRows: j.total_rows,
        validRows: j.valid_rows,
        errorRows: j.error_rows,
        importedRows: j.imported_rows,
        validationSummary: j.validation_summary,
        createdAt: j.created_at,
      })),
    });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const body = (await request.json()) as {
      entityType?: string;
      filename?: string;
      csvText?: string;
      xlsxBase64?: string;
      format?: string;
    };
    if (!body.entityType || !ENTITY_TYPES.includes(body.entityType as ImportEntityType)) {
      return NextResponse.json(
        {
          error: "VALIDATION",
          message: `entityType must be one of: ${ENTITY_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }
    const hasCsv = typeof body.csvText === "string" && body.csvText.length > 0;
    const hasXlsx =
      typeof body.xlsxBase64 === "string" && body.xlsxBase64.length > 0;
    if (!hasCsv && !hasXlsx) {
      return NextResponse.json(
        { error: "VALIDATION", message: "csvText or xlsxBase64 is required" },
        { status: 400 }
      );
    }
    if (hasCsv && (body.csvText as string).length > 4_000_000) {
      return NextResponse.json(
        { error: "VALIDATION", message: "CSV too large (max ~4MB text)" },
        { status: 400 }
      );
    }
    if (hasXlsx && (body.xlsxBase64 as string).length > 5_500_000) {
      return NextResponse.json(
        { error: "VALIDATION", message: "Workbook too large (max ~4MB binary)" },
        { status: 400 }
      );
    }
    const { job, results } = await createImportJob(ctx, {
      entityType: body.entityType as ImportEntityType,
      filename: body.filename ?? (hasXlsx ? "upload.xlsx" : "upload.csv"),
      format: body.format,
      csvText: hasCsv ? body.csvText : undefined,
      xlsxBase64: hasXlsx ? body.xlsxBase64 : undefined,
    });
    return NextResponse.json(
      {
        job: {
          id: job.id,
          entityType: job.entity_type,
          status: job.status,
          totalRows: job.total_rows,
          validRows: job.valid_rows,
          errorRows: job.error_rows,
          validationSummary: job.validation_summary,
        },
        preview: results.slice(0, 100),
        previewTruncated: results.length > 100,
      },
      { status: 201 }
    );
  } catch (error) {
    return mapApiError(error);
  }
}
