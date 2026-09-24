import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/authz";
import { mapApiError, unauthenticated } from "@/lib/api-errors";
import {
  approveImportJob,
  getImportJob,
  runImportJob,
} from "@/lib/import-engine";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/import/[id] — job status + validation summary.
 * POST /api/import/[id] — { action: "approve" | "run" }
 * Pipeline: validated → approved → completed (server re-checks each step).
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const { id } = await params;
    const job = await getImportJob(ctx, id);
    return NextResponse.json({
      job: {
        id: job.id,
        entityType: job.entity_type,
        status: job.status,
        originalFilename: job.original_filename,
        totalRows: job.total_rows,
        validRows: job.valid_rows,
        errorRows: job.error_rows,
        importedRows: job.imported_rows,
        validationSummary: job.validation_summary,
        createdAt: job.created_at,
      },
    });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(_request: Request, { params }: Params) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const { id } = await params;
    // Body may be empty for simple clients; require explicit action.
    let action = "";
    try {
      const body = (await _request.clone().json()) as { action?: string };
      action = body.action ?? "";
    } catch {
      action = "";
    }
    if (action === "approve") {
      const job = await approveImportJob(ctx, id);
      return NextResponse.json({
        job: { id: job.id, status: job.status, validRows: job.valid_rows },
      });
    }
    if (action === "run") {
      const result = await runImportJob(ctx, id);
      return NextResponse.json({
        job: {
          id: result.job.id,
          status: result.job.status,
          importedRows: result.job.imported_rows,
        },
        imported: result.imported,
        skipped: result.skipped,
      });
    }
    return NextResponse.json(
      { error: "VALIDATION", message: 'action must be "approve" or "run"' },
      { status: 400 }
    );
  } catch (error) {
    return mapApiError(error);
  }
}
