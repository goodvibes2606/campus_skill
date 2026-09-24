import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/authz";
import { mapApiError, unauthenticated } from "@/lib/api-errors";
import {
  EXPORTABLE_ENTITIES,
  runExport,
  toCsv,
  type ExportEntity,
} from "@/lib/export-engine";

/**
 * POST /api/export — controlled export.
 * Body: { entity, format?: "csv" | "json" }
 * Response: JSON envelope with columns/rows or content for download.
 * Role + entity allow-list enforced server-side; every run audited.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const body = (await request.json()) as {
      entity?: string;
      format?: string;
    };
    if (
      !body.entity ||
      !(EXPORTABLE_ENTITIES as readonly string[]).includes(body.entity)
    ) {
      return NextResponse.json(
        {
          error: "VALIDATION",
          message: `entity must be one of: ${EXPORTABLE_ENTITIES.join(", ")}`,
        },
        { status: 400 }
      );
    }
    const format = body.format === "json" ? "json" : "csv";
    const result = await runExport(
      ctx,
      body.entity as ExportEntity,
      format
    );

    if (format === "json") {
      const objects = result.rows.map((r) => {
        const o: Record<string, string | number | null> = {};
        result.columns.forEach((c, i) => {
          o[c] = r[i];
        });
        return o;
      });
      return NextResponse.json({
        entity: result.entity,
        format: "json",
        rowCount: result.rowCount,
        jobId: result.jobId,
        data: objects,
      });
    }

    const csv = toCsv(result.columns, result.rows);
    return NextResponse.json({
      entity: result.entity,
      format: "csv",
      rowCount: result.rowCount,
      jobId: result.jobId,
      columns: result.columns,
      csv,
    });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function GET() {
  return NextResponse.json({
    entities: EXPORTABLE_ENTITIES,
    formats: ["csv", "json"],
  });
}
