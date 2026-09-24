import { NextResponse } from "next/server";

/**
 * Central API error mapper (Milestone 12).
 * Production responses never expose internal error.message details.
 * Validation / Authz messages remain intentional and safe.
 */

export class ApiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiValidationError";
  }
}

type AuthzLike = {
  name: string;
  code?: string;
  message: string;
};

export function mapApiError(error: unknown): NextResponse {
  if (error && typeof error === "object" && "name" in error) {
    const e = error as AuthzLike;
    if (
      e.name === "AuthzError" ||
      e.name === "PlacementValidationError" ||
      e.name === "AcademicOpsValidationError" ||
      e.name === "InstitutionConfigValidationError" ||
      e.name === "ApiValidationError" ||
      e.name === "FileValidationError" ||
      e.name === "FileStoreError"
    ) {
      const isAuthz =
        e.name === "AuthzError" || e.name === "FileStoreError";
      const code =
        isAuthz && e.code === "UNAUTHENTICATED"
          ? 401
          : isAuthz
            ? 403
            : 400;
      const errCode = isAuthz ? e.code || "FORBIDDEN" : "VALIDATION";
      return NextResponse.json(
        { error: errCode, message: e.message },
        { status: code }
      );
    }
  }
  // Fail closed: generic server error without internal details.
  return NextResponse.json(
    { error: "server_error", message: "Something went wrong. Try again." },
    { status: 500 }
  );
}

export function unauthenticated(): NextResponse {
  return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
}
