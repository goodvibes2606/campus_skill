/**
 * Academic resource types + upload validation foundation (Milestone 4).
 * File bytes are NOT stored yet (cloud/local storage deferred by research).
 * Validation is ready for when storage lands.
 */

export const RESOURCE_TYPES = [
  "notes",
  "ppt",
  "pdf",
  "document",
  "study_material",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESOURCE_STATUSES = ["draft", "published", "archived"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

/** Allowed MIME types per resource type (foundation — extend as needed). */
export const ALLOWED_MIME_TYPES: Record<ResourceType, readonly string[]> = {
  notes: [
    "text/plain",
    "text/markdown",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ppt: [
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/pdf",
  ],
  pdf: ["application/pdf"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
  ],
  study_material: [
    "application/pdf",
    "text/plain",
    "text/markdown",
    "image/png",
    "image/jpeg",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

/** Max upload size: 25 MB (foundation default). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export class ResourceValidationError extends Error {
  readonly code = "VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "ResourceValidationError";
  }
}

export type UploadCandidate = {
  resourceType: ResourceType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Server-side upload validation foundation.
 * Rejects wrong type, oversized, and disallowed MIME types.
 * Does not touch storage.
 */
export function validateUpload(candidate: UploadCandidate): void {
  if (!RESOURCE_TYPES.includes(candidate.resourceType)) {
    throw new ResourceValidationError(
      `Invalid resource type: ${candidate.resourceType}`
    );
  }
  if (!candidate.filename || candidate.filename.trim().length === 0) {
    throw new ResourceValidationError("Filename is required");
  }
  if (candidate.filename.length > 255) {
    throw new ResourceValidationError("Filename too long (max 255)");
  }
  if (!Number.isFinite(candidate.sizeBytes) || candidate.sizeBytes < 0) {
    throw new ResourceValidationError("Invalid file size");
  }
  if (candidate.sizeBytes === 0) {
    throw new ResourceValidationError("File is empty");
  }
  if (candidate.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new ResourceValidationError(
      `File exceeds ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit`
    );
  }
  const allowed = ALLOWED_MIME_TYPES[candidate.resourceType];
  const mime = (candidate.mimeType || "").toLowerCase().split(";")[0].trim();
  if (!allowed.includes(mime)) {
    throw new ResourceValidationError(
      `MIME type "${mime}" not allowed for ${candidate.resourceType}`
    );
  }
}

export function isResourceType(v: unknown): v is ResourceType {
  return (
    typeof v === "string" && (RESOURCE_TYPES as readonly string[]).includes(v)
  );
}

export function isResourceStatus(v: unknown): v is ResourceStatus {
  return (
    typeof v === "string" && (RESOURCE_STATUSES as readonly string[]).includes(v)
  );
}
