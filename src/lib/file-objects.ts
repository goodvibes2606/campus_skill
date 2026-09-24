import { randomUUID } from "crypto";

import { pool } from "@/lib/db";
import { AuthzError, type AuthContext } from "@/lib/authz";
import {
  assertInstitutionWorkspaceRow,
  getInstitutionWorkspaceScope,
} from "@/lib/institution-scope";
import {
  deleteFileBytes,
  getFileBytes,
  putFileBytes,
  sha256Hex,
} from "@/lib/file-store";

/**
 * File/blob storage foundation (Milestone 12).
 * Metadata row in Postgres; bytes on local_fs under `.file-store/`.
 * Institution-scoped, server-authorized, audited upload/delete/download.
 */

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB foundation limit

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/zip",
]);

export type FileObjectRow = {
  id: string;
  institution_id: string;
  uploaded_by: string;
  owner_type: string;
  owner_id: string | null;
  original_name: string;
  content_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  storage_provider: string;
  storage_key: string;
  visibility: string;
  status: string;
  created_at: Date;
  deleted_at: Date | null;
};

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileValidationError";
  }
}

export function validateFileMeta(input: {
  filename?: string;
  contentType?: string;
  sizeBytes?: number;
}): { filename: string; contentType: string; sizeBytes: number } {
  const filename = (input.filename || "").trim();
  if (!filename || filename.length > 255 || filename.includes("/") || filename.includes("..")) {
    throw new FileValidationError("Invalid filename");
  }
  const contentType = (input.contentType || "").toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new FileValidationError("File type not allowed");
  }
  const sizeBytes = Number(input.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0 || sizeBytes > MAX_FILE_BYTES) {
    throw new FileValidationError("File size exceeds limit");
  }
  return { filename, contentType, sizeBytes };
}

export async function createFileObject(
  ctx: AuthContext,
  input: {
    filename: string;
    contentType: string;
    sizeBytes: number;
    ownerType?: string;
    ownerId?: string;
    visibility?: string;
    departmentId?: string | null;
    sectionId?: string | null;
    subjectId?: string | null;
    /** Base64 content — when present, bytes are persisted to local_fs. */
    contentBase64?: string;
  }
): Promise<FileObjectRow> {
  const scope = await getInstitutionWorkspaceScope(ctx);
  // Upload allowed for active institution members (not recruiters).
  if (!ctx.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }
  if (ctx.roleName === "recruiter") {
    throw new AuthzError("FORBIDDEN", "Recruiters cannot upload institutional files");
  }
  void scope;

  const meta = validateFileMeta(input);
  const institutionId = ctx.institutionId;
  const id = randomUUID();
  const storageKey = `inst/${institutionId}/${id}/${meta.filename}`;

  let checksum: string | null = null;
  let storageProvider = "local_metadata";
  if (input.contentBase64 !== undefined && input.contentBase64 !== "") {
    let bytes: Buffer;
    try {
      bytes = Buffer.from(input.contentBase64, "base64");
    } catch {
      throw new FileValidationError("Invalid base64 content");
    }
    if (bytes.length === 0) {
      throw new FileValidationError("File content is empty");
    }
    if (bytes.length > MAX_FILE_BYTES) {
      throw new FileValidationError("File size exceeds limit");
    }
    if (Number(meta.sizeBytes) !== bytes.length) {
      throw new FileValidationError("sizeBytes does not match content length");
    }
    const stored = await putFileBytes(storageKey, bytes);
    checksum = stored.checksum;
    storageProvider = "local_fs";
  }

  const inserted = await pool.query<FileObjectRow>(
    `INSERT INTO public.file_objects (
        id, institution_id, uploaded_by, owner_type, owner_id,
        original_name, content_type, size_bytes, checksum_sha256,
        storage_provider, storage_key, visibility,
        scope_department_id, scope_section_id, scope_subject_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      id,
      institutionId,
      ctx.userId,
      input.ownerType || "resource",
      input.ownerId ?? null,
      meta.filename,
      meta.contentType,
      meta.sizeBytes,
      checksum,
      storageProvider,
      storageKey,
      input.visibility || "institution",
      input.departmentId ?? null,
      input.sectionId ?? null,
      input.subjectId ?? null,
    ]
  );

  await pool.query(
    `INSERT INTO public.institution_config_audit
        (institution_id, changed_by, area, action, status, new_value)
     VALUES ($1,$2,'files','upload','active',$3)`,
    [
      institutionId,
      ctx.userId,
      JSON.stringify({
        file_id: id,
        name: meta.filename,
        size: meta.sizeBytes,
        type: meta.contentType,
      }),
    ]
  );

  return inserted.rows[0];
}

export async function getFileObject(
  ctx: AuthContext,
  fileId: string
): Promise<FileObjectRow> {
  const result = await pool.query<FileObjectRow>(
    `SELECT * FROM public.file_objects WHERE id = $1 AND status = 'active'`,
    [fileId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "File not found");
  }
  if (!ctx.institutionId || row.institution_id !== ctx.institutionId) {
    // system_admin technical read only via explicit path — still require match unless system_admin
    if (ctx.roleName !== "system_admin") {
      throw new AuthzError("FORBIDDEN", "Institution access denied");
    }
  }
  if (ctx.roleName === "recruiter") {
    throw new AuthzError("FORBIDDEN", "File access denied");
  }
  return row;
}

/**
 * Load authorized file bytes (institution + role checks via getFileObject).
 * Returns null when the row has no persisted content.
 */
export async function readFileObjectContent(
  ctx: AuthContext,
  fileId: string
): Promise<{ row: FileObjectRow; bytes: Buffer } | null> {
  const row = await getFileObject(ctx, fileId);
  if (row.storage_provider !== "local_fs") {
    return null;
  }
  const bytes = await getFileBytes(row.storage_key);
  if (row.checksum_sha256 && sha256Hex(bytes) !== row.checksum_sha256) {
    throw new AuthzError("FORBIDDEN", "File content integrity check failed");
  }
  if (bytes.length !== Number(row.size_bytes)) {
    throw new AuthzError("FORBIDDEN", "File content size mismatch");
  }
  return { row, bytes };
}

export async function softDeleteFileObject(
  ctx: AuthContext,
  fileId: string
): Promise<void> {
  if (!["admin", "faculty", "hod", "director_dean", "tpo"].includes(ctx.roleName)) {
    throw new AuthzError("FORBIDDEN", "Delete not authorized for your role");
  }
  const row = await getFileObject(ctx, fileId);
  if (row.uploaded_by !== ctx.userId && !["admin", "director_dean"].includes(ctx.roleName)) {
    throw new AuthzError("FORBIDDEN", "Only uploader or admin may delete this file");
  }
  await pool.query(
    `UPDATE public.file_objects
        SET status = 'deleted', deleted_at = now()
      WHERE id = $1 AND institution_id = $2`,
    [fileId, row.institution_id]
  );
  if (row.storage_provider === "local_fs") {
    await deleteFileBytes(row.storage_key);
  }
  await pool.query(
    `INSERT INTO public.institution_config_audit
        (institution_id, changed_by, area, action, status, previous_value)
     VALUES ($1,$2,'files','delete','deleted',$3)`,
    [
      row.institution_id,
      ctx.userId,
      JSON.stringify({ file_id: fileId, name: row.original_name }),
    ]
  );
}

export async function listFileObjects(
  ctx: AuthContext,
  query: { ownerType?: string; ownerId?: string; limit?: number } = {}
): Promise<FileObjectRow[]> {
  if (!ctx.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }
  if (ctx.roleName === "recruiter") {
    throw new AuthzError("FORBIDDEN", "File access denied");
  }
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const params: unknown[] = [ctx.institutionId];
  const clauses: string[] = [`status = 'active'`];
  if (query.ownerType) {
    params.push(query.ownerType);
    clauses.push(`owner_type = $${params.length}`);
  }
  if (query.ownerId) {
    params.push(query.ownerId);
    clauses.push(`owner_id = $${params.length}`);
  }
  params.push(limit);
  const result = await pool.query<FileObjectRow>(
    `SELECT * FROM public.file_objects
      WHERE institution_id = $1 AND ${clauses.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

void assertInstitutionWorkspaceRow;
