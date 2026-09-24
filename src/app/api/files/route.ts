import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/authz";
import { mapApiError, unauthenticated } from "@/lib/api-errors";
import { createFileObject, listFileObjects } from "@/lib/file-objects";

/**
 * GET  /api/files — list file metadata for caller's institution.
 * POST /api/files — register file metadata (base64 content optional).
 * Recruiters denied. Institution-scoped. Audited.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const { searchParams } = new URL(request.url);
    const files = await listFileObjects(ctx, {
      ownerType: searchParams.get("ownerType") ?? undefined,
      ownerId: searchParams.get("ownerId") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 50) || 50,
    });
    return NextResponse.json({
      count: files.length,
      files: files.map((f) => ({
        id: f.id,
        originalName: f.original_name,
        contentType: f.content_type,
        sizeBytes: f.size_bytes,
        ownerType: f.owner_type,
        ownerId: f.owner_id,
        visibility: f.visibility,
        uploadedBy: f.uploaded_by,
        createdAt: f.created_at,
        status: f.status,
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
      filename?: string;
      contentType?: string;
      sizeBytes?: number;
      ownerType?: string;
      ownerId?: string;
      visibility?: string;
      contentBase64?: string;
    };
    let sizeBytes = Number(body.sizeBytes ?? 0);
    const contentBase64 = body.contentBase64;
    if (contentBase64 !== undefined && contentBase64 !== "") {
      if (typeof contentBase64 !== "string") {
        return NextResponse.json(
          { error: "VALIDATION", message: "contentBase64 must be a string" },
          { status: 400 }
        );
      }
      const decoded = Buffer.from(contentBase64, "base64");
      if (Number.isFinite(sizeBytes) && sizeBytes > 0 && decoded.length !== sizeBytes) {
        return NextResponse.json(
          {
            error: "VALIDATION",
            message: "sizeBytes does not match contentBase64 length",
          },
          { status: 400 }
        );
      }
      if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
        sizeBytes = decoded.length;
      }
    }
    const file = await createFileObject(ctx, {
      filename: body.filename ?? "",
      contentType: body.contentType ?? "",
      sizeBytes,
      ownerType: body.ownerType,
      ownerId: body.ownerId,
      visibility: body.visibility,
      contentBase64,
    });
    return NextResponse.json(
      {
        file: {
          id: file.id,
          originalName: file.original_name,
          contentType: file.content_type,
          sizeBytes: file.size_bytes,
          storageProvider: file.storage_provider,
          storageKey: file.storage_key,
          visibility: file.visibility,
          createdAt: file.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return mapApiError(error);
  }
}
