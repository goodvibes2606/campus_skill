import { cache } from "react";

import { pool } from "@/lib/db";
import {
  AuthzError,
  ROLES,
  type AuthContext,
} from "@/lib/authz";

/**
 * Placement scope & authorization (Milestone 9).
 *
 * Server-side authoritative boundaries:
 * - system_admin → placement access DENIED (technical admin only; no
 *   placement approval authority).
 * - student → own placement data only.
 * - director_dean → institutional approval authority (approve/reject +
 *   read); NOT automatic operational editing of companies/opportunities.
 * - tpo (role or active TPO responsibility) → institution-wide operator.
 * - faculty with an active 'placement_faculty' responsibility → operator
 *   limited to the assigned department/program scope.
 * - faculty without a placement responsibility → no placement admin rights.
 * - hod → department-scoped oversight (read); no Director approval powers.
 * - admin → institution read-only oversight (no approval authority).
 *
 * Client navigation is UX only — every service re-checks these rules.
 */

export type PlacementAccess =
  | "student"
  | "operator"
  | "approver"
  | "oversight"
  | "denied";

export type ActiveResponsibility = {
  id: string;
  responsibility: "tpo" | "placement_faculty";
  institution_id: string;
  person_id: string;
  department_id: string | null;
  program_id: string | null;
  starts_on: string | Date | null;
  ends_on: string | Date | null;
  status: "pending" | "active" | "ended" | "rejected";
  responsibility_title: string;
  scope_notes: string;
};

export type PlacementScope = {
  userId: string;
  roleName: string;
  institutionId: string | null;
  access: PlacementAccess;
  /** Institution-wide operator (tpo). */
  isTpo: boolean;
  /** Scoped operator (assigned placement faculty). */
  isPlacementFaculty: boolean;
  canOperate: boolean;
  /** Director/Dean approval authority only. */
  canApprove: boolean;
  /** Read-only oversight (hod, admin). */
  canOversight: boolean;
  canManageAppointments: boolean;
  canCreateAppointments: boolean;
  /**
   * Department IDs the caller may operate on.
   * null = institution-wide; [] = no operating scope.
   */
  operateDepartmentIds: string[] | null;
  /** Program IDs within scope (null = all programs). */
  operateProgramIds: string[] | null;
  activeResponsibilities: ActiveResponsibility[];
  /** HOD headed departments (oversight only). */
  oversightDepartmentIds: string[];
};

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

async function loadActiveResponsibilities(
  userId: string
): Promise<ActiveResponsibility[]> {
  const result = await pool.query<ActiveResponsibility>(
    `SELECT id, responsibility, institution_id, person_id,
            department_id, program_id, starts_on, ends_on, status,
            responsibility_title, scope_notes
       FROM public.placement_responsibilities
      WHERE person_id = $1
        AND status = 'active'
        AND (starts_on IS NULL OR starts_on <= current_date)
        AND (ends_on IS NULL OR ends_on >= current_date)
      ORDER BY starts_on DESC NULLS LAST`,
    [userId]
  );
  return result.rows;
}

async function loadHeadedDepartmentIds(userId: string): Promise<string[]> {
  const result = await pool.query<{ department_id: string }>(
    `SELECT department_id FROM public.department_heads
      WHERE hod_id = $1 AND valid_to IS NULL`,
    [userId]
  );
  return result.rows.map((r) => r.department_id);
}

/** Load placement scope for the authenticated user (per request). */
export const getPlacementScope = cache(
  async (ctx: AuthContext): Promise<PlacementScope> => {
    const base: PlacementScope = {
      userId: ctx.userId,
      roleName: ctx.roleName,
      institutionId: ctx.institutionId,
      access: "denied",
      isTpo: false,
      isPlacementFaculty: false,
      canOperate: false,
      canApprove: false,
      canOversight: false,
      canManageAppointments: false,
      canCreateAppointments: false,
      operateDepartmentIds: [],
      operateProgramIds: [],
      activeResponsibilities: [],
      oversightDepartmentIds: [],
    };

    // System admin: technical administration only — no placement access.
    if (ctx.roleName === ROLES.systemAdmin) {
      return base;
    }

    if (ctx.roleName === ROLES.student) {
      if (!ctx.institutionId) return base;
      return { ...base, access: "student", institutionId: ctx.institutionId };
    }

    if (!ctx.institutionId) {
      return base;
    }

    if (ctx.roleName === ROLES.directorDean) {
      return {
        ...base,
        access: "approver",
        canApprove: true,
        canOversight: true,
        canManageAppointments: true,
        canCreateAppointments: true,
        // Approver is institution-wide read; operateDepartmentIds stays []
        // so operational create/edit is NOT granted automatically.
        operateDepartmentIds: null,
        operateProgramIds: null,
        oversightDepartmentIds: [],
      };
    }

    if (ctx.roleName === ROLES.hod) {
      const headed = await loadHeadedDepartmentIds(ctx.userId);
      return {
        ...base,
        access: "oversight",
        canOversight: true,
        oversightDepartmentIds: headed,
        operateDepartmentIds: [],
        operateProgramIds: [],
      };
    }

    if (ctx.roleName === ROLES.admin) {
      // [ASSUMPTION] Institution admin: read-only placement oversight
      // for companies/opportunities/applications, plus may REQUEST
      // appointment rows (create pending only — approval stays Director/Dean).
      return {
        ...base,
        access: "oversight",
        canOversight: true,
        canManageAppointments: true,
        canCreateAppointments: true,
        operateDepartmentIds: [],
        operateProgramIds: [],
      };
    }

    if (ctx.roleName === ROLES.faculty || ctx.roleName === ROLES.tpo) {
      const responsibilities = await loadActiveResponsibilities(ctx.userId);
      const scoped = responsibilities.filter(
        (r) => r.institution_id === ctx.institutionId
      );
      const tpoRow = scoped.find((r) => r.responsibility === "tpo");
      const facultyRows = scoped.filter(
        (r) => r.responsibility === "placement_faculty"
      );

      const isTpo =
        ctx.roleName === ROLES.tpo || Boolean(tpoRow);
      const isPlacementFaculty = facultyRows.length > 0;

      if (isTpo) {
        return {
          ...base,
          access: "operator",
          isTpo: true,
          canOperate: true,
          canOversight: true,
          activeResponsibilities: scoped,
          operateDepartmentIds: null, // institution-wide
          operateProgramIds: null,
        };
      }

      if (isPlacementFaculty) {
        const deptIds = facultyRows
          .map((r) => r.department_id)
          .filter((v): v is string => Boolean(v));
        const programIds = facultyRows
          .map((r) => r.program_id)
          .filter((v): v is string => Boolean(v));
        // null department on the responsibility = institution-wide faculty scope
        const anyUnscoped = facultyRows.some((r) => !r.department_id);
        return {
          ...base,
          access: "operator",
          isPlacementFaculty: true,
          canOperate: true,
          canOversight: true,
          activeResponsibilities: scoped,
          operateDepartmentIds: anyUnscoped ? null : deptIds,
          operateProgramIds: anyUnscoped ? null : (programIds.length ? programIds : null),
        };
      }

      // Faculty with no placement responsibility: no placement admin rights.
      return {
        ...base,
        access: "denied",
        activeResponsibilities: scoped,
      };
    }

    // Unknown roles: no placement access.
    return base;
  }
);

// ---------------------------------------------------------------------------
// Assertions used by placement services
// ---------------------------------------------------------------------------

export function assertPlacementAccess(
  scope: PlacementScope,
  ...allowed: PlacementAccess[]
): void {
  if (!allowed.includes(scope.access)) {
    throw new AuthzError(
      "FORBIDDEN",
      "You are not authorized for this placement action"
    );
  }
}

export function assertPlacementOperate(scope: PlacementScope): void {
  if (!scope.canOperate || scope.access !== "operator") {
    throw new AuthzError(
      "FORBIDDEN",
      "Placement operations require an active TPO or assigned placement faculty responsibility"
    );
  }
}

export function assertPlacementApprove(scope: PlacementScope): void {
  if (!scope.canApprove || scope.roleName !== ROLES.directorDean) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only Director/Dean approval authority may perform this action"
    );
  }
}

export function assertPlacementInstitution(
  scope: PlacementScope,
  institutionId: string
): void {
  if (!institutionId) {
    throw new AuthzError("FORBIDDEN", "Missing institution scope");
  }
  if (!scope.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "Profile has no institution assigned");
  }
  if (scope.institutionId !== institutionId) {
    throw new AuthzError("FORBIDDEN", "Institution access denied");
  }
}

/**
 * True if the operator may act on an entity whose optional department /
 * program scope is given. Institution-wide entities (null department) are
 * only manageable by institution-wide operators (operateDepartmentIds null).
 */
export function scopeCovers(
  scope: PlacementScope,
  entity: { department_id?: string | null; program_id?: string | null }
): boolean {
  if (!scope.canOperate) return false;
  if (scope.operateDepartmentIds === null) return true;
  if (!entity.department_id) {
    // Institution-wide entity: only institution-wide operators.
    return false;
  }
  if (!scope.operateDepartmentIds.includes(entity.department_id)) return false;
  if (entity.program_id && scope.operateProgramIds !== null) {
    return scope.operateProgramIds.includes(entity.program_id);
  }
  return true;
}

export function assertScopeCovers(
  scope: PlacementScope,
  entity: { department_id?: string | null; program_id?: string | null },
  what = "record"
): void {
  if (!scopeCovers(scope, entity)) {
    throw new AuthzError(
      "FORBIDDEN",
      `Your placement responsibility does not cover this ${what}`
    );
  }
}

/** Operator may create a new institution-wide record only if unscoped. */
export function assertCanCreateInstitutionWide(scope: PlacementScope): void {
  if (!scope.canOperate) {
    throw new AuthzError("FORBIDDEN", "Placement operations not authorized");
  }
  if (scope.operateDepartmentIds !== null) {
    throw new AuthzError(
      "FORBIDDEN",
      "Your placement responsibility is department-scoped; an institution-wide TPO must create this record"
    );
  }
}

export { ZERO_UUID };
