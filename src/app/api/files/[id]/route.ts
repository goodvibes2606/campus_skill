import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/authz";
import { mapApiError, unauthenticated } from "@/lib/api-errors";
import {
  FileValidationError,
  getFileObject,
  readFileObjectContent,
  softDeleteFileObject,
} from "@/lib/file-objects";

type Params = { params: Promise<{ id: string }> };

/**
 * GET    /api/files/[id] — file metadata (institution-scoped).
 *        ?content=1 — authorized bytes (Content-Disposition attachment).
 * DELETE /api/files/[id] — soft delete (uploader or admin/director).
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const { id } = await params;
    const wantsContent =
      new URL(request.url).searchParams.get("content") === "1";
    if (wantsContent) {
      const loaded = await readFileObjectContent(ctx, id);
      if (!loaded) {
        return NextResponse.json(
          { error: "NOT_FOUND", message: "File content not available" },
          { status: 404 }
        );
      }
      const safeName = loaded.row.original_name.replace(/["\\\r\n]/g, "_");
      return new NextResponse(new Uint8Array(loaded.bytes), {
        status: 200,
        headers: {
          "content-type": loaded.row.content_type || "application/octet-stream",
          "content-length": String(loaded.bytes.length),
          "content-disposition": `attachment; filename="${safeName}"`,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
    const file = await getFileObject(ctx, id);
    return NextResponse.json({
      file: {
        id: file.id,
        originalName: file.original_name,
        contentType: file.content_type,
        sizeBytes: file.size_bytes,
        ownerType: file.owner_type,
        ownerId: file.owner_id,
        visibility: file.visibility,
        uploadedBy: file.uploaded_by,
        storageProvider: file.storage_provider,
        createdAt: file.created_at,
        status: file.status,
      },
    });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const { id } = await params;
    await softDeleteFileObject(ctx, id);
    return NextResponse.json({ ok: true, id, status: "deleted" });
  } catch (error) {
    if (error instanceof FileValidationError) {
      return NextResponse.json(
        { error: "VALIDATION", message: error.message },
        { status: 400 }
      );
    }
    return mapApiError(error);
  }
}
