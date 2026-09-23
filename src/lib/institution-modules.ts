import { pool } from "@/lib/db";
import { AuthzError, type AuthContext } from "@/lib/authz";
import {
  assertCanConfigureInstitution,
  assertCanReadInstitutionWorkspace,
  getInstitutionWorkspaceScope,
} from "@/lib/institution-scope";

/**
 * Institution module/feature flags (Milestone 11).
 * Institution-scoped; server-side checks are authoritative
 * (client feature-hiding is UX only). Never auto-disables existing modules.
 */

/** Known module catalog (extend as milestones ship). */
export const INSTITUTION_MODULE_KEYS = [
  "student_management",
  "faculty",
  "resources",
  "syllabus",
  "assignments",
  "assessments",
  "question_bank",
  "calendar",
  "notifications",
  "placement",
  "ai_assistance",
  "alumni",
] as const;

export type InstitutionModuleKey = (typeof INSTITUTION_MODULE_KEYS)[number];

export type InstitutionModuleRow = {
  id: string;
  institution_id: string;
  module_key: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

export type InstitutionModuleView = {
  moduleKey: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  updatedAt: Date | null;
  /** true when no explicit row — default enabled. */
  isDefault: boolean;
};

function isKnownModuleKey(key: string): key is InstitutionModuleKey {
  return (INSTITUTION_MODULE_KEYS as readonly string[]).includes(key);
}

/** List modules for the caller's institution (defaults filled for missing keys). */
export async function listInstitutionModules(
  ctx: AuthContext
): Promise<InstitutionModuleView[]> {
  const scope = await getInstitutionWorkspaceScope(ctx);
  assertCanReadInstitutionWorkspace(scope);
  if (!scope.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }
  return listModulesForInstitution(scope.institutionId);
}

export async function listModulesForInstitution(
  institutionId: string
): Promise<InstitutionModuleView[]> {
  const result = await pool.query<InstitutionModuleRow>(
    `SELECT * FROM public.institution_modules
      WHERE institution_id = $1
      ORDER BY module_key`,
    [institutionId]
  );
  const byKey = new Map(result.rows.map((r) => [r.module_key, r]));
  return INSTITUTION_MODULE_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      moduleKey: key,
      enabled: row ? row.enabled : true,
      settings: row?.settings ?? {},
      updatedAt: row?.updated_at ?? null,
      isDefault: !row,
    };
  });
}

export type SetModuleInput = {
  moduleKey: string;
  enabled: boolean;
};

/** Toggle a module (institution admin only) + audit. */
export async function setInstitutionModule(
  ctx: AuthContext,
  input: SetModuleInput
): Promise<InstitutionModuleView> {
  const scope = await getInstitutionWorkspaceScope(ctx);
  const institutionId = assertCanConfigureInstitution(scope);

  const key = (input.moduleKey || "").trim();
  if (!isKnownModuleKey(key)) {
    throw new AuthzError("FORBIDDEN", "Unknown module");
  }

  const before = await pool.query<InstitutionModuleRow>(
    `SELECT * FROM public.institution_modules
      WHERE institution_id = $1 AND module_key = $2`,
    [institutionId, key]
  );
  const prev = before.rows[0];

  const upserted = await pool.query<InstitutionModuleRow>(
    `INSERT INTO public.institution_modules (institution_id, module_key, enabled)
     VALUES ($1, $2, $3)
     ON CONFLICT (institution_id, module_key)
     DO UPDATE SET enabled = EXCLUDED.enabled
     RETURNING *`,
    [institutionId, key, input.enabled]
  );
  const row = upserted.rows[0];

  await pool.query(
    `INSERT INTO public.institution_config_audit
        (institution_id, changed_by, area, action, status, previous_value, new_value)
     VALUES ($1,$2,'modules','update',$3,$4,$5)`,
    [
      institutionId,
      ctx.userId,
      row.enabled ? "enabled" : "disabled",
      prev ? JSON.stringify({ module_key: key, enabled: prev.enabled }) : null,
      JSON.stringify({ module_key: key, enabled: row.enabled }),
    ]
  );

  return {
    moduleKey: row.module_key,
    enabled: row.enabled,
    settings: row.settings,
    updatedAt: row.updated_at,
    isDefault: false,
  };
}

/**
 * Server-side module gate for feature routes (defense in depth).
 * Missing row = enabled. Never trusts client-side feature flags.
 */
export async function isModuleEnabled(
  institutionId: string | null,
  moduleKey: InstitutionModuleKey
): Promise<boolean> {
  if (!institutionId) return true;
  const result = await pool.query<{ enabled: boolean }>(
    `SELECT enabled FROM public.institution_modules
      WHERE institution_id = $1 AND module_key = $2`,
    [institutionId, moduleKey]
  );
  if (!result.rows[0]) return true;
  return result.rows[0].enabled;
}

export async function assertModuleEnabled(
  institutionId: string | null,
  moduleKey: InstitutionModuleKey
): Promise<void> {
  const enabled = await isModuleEnabled(institutionId, moduleKey);
  if (!enabled) {
    throw new AuthzError(
      "FORBIDDEN",
      `Module "${moduleKey}" is disabled for this institution`
    );
  }
}
