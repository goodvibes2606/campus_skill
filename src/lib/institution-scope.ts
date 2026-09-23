import { cache } from "react";

import {
  AuthzError,
  ROLES,
  requireInstitution,
  type AuthContext,
} from "@/lib/authz";

/**
 * Institution Workspace scope & authorization (Milestone 11).
 *
 * Server-side authoritative boundaries (client nav is UX only):
 * - admin → configure own institution (profile, branding, modules, users read);
 *            drafts config changes; may publish non-sensitive areas directly.
 * - director_dean → institutional approval authority for sensitive config
 *            changes (approve/reject) + full read; NOT Platform Owner.
 * - system_admin → technical administration only — NO institutional config
 *            write power, NOT automatic Director/Dean or Platform Owner.
 * - hod / tpo / faculty / student / recruiter → no config write.
 * - Platform Owner role does not exist yet (documented; no broad permission invented).
 */

export type InstitutionWorkspaceAccess =
  | "configure"
  | "approve"
  | "read_only"
  | "denied";

export type InstitutionWorkspaceScope = {
  userId: string;
  roleName: string;
  institutionId: string | null;
  access: InstitutionWorkspaceAccess;
  /** May edit profile/branding/modules for own institution. */
  canConfigure: boolean;
  /** May approve/reject sensitive config changes (Director/Dean only). */
  canApprove: boolean;
  /** May read workspace (configure, approve, or system_admin technical). */
  canRead: boolean;
  /** May view audit trail (admin, director, system_admin). */
  canViewAudit: boolean;
  /** May view import-center foundation (admin only). */
  canImport: boolean;
};

export const getInstitutionWorkspaceScope = cache(
  async (ctx: AuthContext): Promise<InstitutionWorkspaceScope> => {
    const base: InstitutionWorkspaceScope = {
      userId: ctx.userId,
      roleName: ctx.roleName,
      institutionId: ctx.institutionId,
      access: "denied",
      canConfigure: false,
      canApprove: false,
      canRead: false,
      canViewAudit: false,
      canImport: false,
    };

    if (ctx.roleName === ROLES.systemAdmin) {
      // Technical admin: may read for diagnostics, never write institution config.
      return {
        ...base,
        access: "read_only",
        canRead: true,
        canViewAudit: true,
      };
    }

    if (!ctx.institutionId) {
      return base;
    }

    if (ctx.roleName === ROLES.admin) {
      return {
        ...base,
        access: "configure",
        canConfigure: true,
        canRead: true,
        canViewAudit: true,
        canImport: true,
      };
    }

    if (ctx.roleName === ROLES.directorDean) {
      return {
        ...base,
        access: "approve",
        canApprove: true,
        canRead: true,
        canViewAudit: true,
      };
    }

    // hod, tpo, faculty, student, recruiter, unknown: no config access.
    return base;
  }
);

export function assertCanReadInstitutionWorkspace(
  scope: InstitutionWorkspaceScope
): void {
  if (!scope.canRead) {
    throw new AuthzError(
      "FORBIDDEN",
      "Institution workspace is limited to institution admin, Director/Dean, and system administration"
    );
  }
}

export function assertCanConfigureInstitution(
  scope: InstitutionWorkspaceScope
): string {
  assertCanReadInstitutionWorkspace(scope);
  if (!scope.canConfigure || !scope.institutionId) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only the institution administrator may change institution configuration"
    );
  }
  return scope.institutionId;
}

export function assertCanApproveInstitutionConfig(
  scope: InstitutionWorkspaceScope
): string {
  if (!scope.canApprove || scope.roleName !== ROLES.directorDean) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only Director/Dean approval authority may review institution configuration changes"
    );
  }
  if (!scope.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "Profile has no institution assigned");
  }
  return scope.institutionId;
}

/** Ensure the institution on a row belongs to the caller's institution. */
export function assertInstitutionWorkspaceRow(
  scope: InstitutionWorkspaceScope,
  rowInstitutionId: string | null | undefined
): void {
  if (!rowInstitutionId) {
    throw new AuthzError("FORBIDDEN", "Missing institution scope");
  }
  if (!scope.institutionId && scope.roleName !== ROLES.systemAdmin) {
    throw new AuthzError("NO_INSTITUTION", "Profile has no institution assigned");
  }
  // system_admin may cross-institution for read; configure path never reaches here
  // without scope.institutionId from requireInstitution.
  if (
    scope.roleName !== ROLES.systemAdmin &&
    scope.institutionId !== rowInstitutionId
  ) {
    throw new AuthzError("FORBIDDEN", "Institution access denied");
  }
}

/** Require caller's own institution id (configure path). */
export function requireOwnInstitution(ctx: AuthContext): string {
  return requireInstitution(ctx);
}

/** Areas that use the Draft → Review → Approve → Publish lifecycle. */
export const SENSITIVE_CONFIG_AREAS = new Set([
  "modules",
  "security",
  "integrations",
  "advanced",
]);

/** Areas an institution admin may save directly (with audit). */
export const DIRECT_CONFIG_AREAS = new Set([
  "profile",
  "branding",
  "contact",
  "public_profile",
  "onboarding",
]);

export function isSensitiveConfigArea(area: string): boolean {
  return SENSITIVE_CONFIG_AREAS.has(area);
}

export function isDirectConfigArea(area: string): boolean {
  return DIRECT_CONFIG_AREAS.has(area);
}
