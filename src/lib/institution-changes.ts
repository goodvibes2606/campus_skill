import { pool } from "@/lib/db";
import { AuthzError, ROLES, type AuthContext } from "@/lib/authz";
import {
  assertCanApproveInstitutionConfig,
  assertCanConfigureInstitution,
  assertCanReadInstitutionWorkspace,
  getInstitutionWorkspaceScope,
  isSensitiveConfigArea,
} from "@/lib/institution-scope";

/**
 * Config change lifecycle foundation (Milestone 11).
 * Draft → In review → Approved → Published (or Rejected).
 * Used for sensitive areas (modules, security, integrations, advanced).
 * Documented limitation: not a full workflow builder.
 */

export type ConfigChangeStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "rejected";

export type ConfigChangeRow = {
  id: string;
  institution_id: string;
  area: string;
  payload: Record<string, unknown>;
  status: ConfigChangeStatus;
  requested_by: string;
  reviewed_by: string | null;
  published_by: string | null;
  review_note: string | null;
  created_at: Date;
  updated_at: Date;
  reviewed_at: Date | null;
  published_at: Date | null;
};

export type ConfigChangeView = ConfigChangeRow & {
  requester_name: string;
  reviewer_name: string | null;
  publisher_name: string | null;
};

const SELECT_CHANGE = `
  SELECT ch.*,
         req.full_name AS requester_name,
         rev.full_name AS reviewer_name,
         pub.full_name AS publisher_name
    FROM public.institution_config_changes ch
    JOIN public.profiles req ON req.id = ch.requested_by
    LEFT JOIN public.profiles rev ON rev.id = ch.reviewed_by
    LEFT JOIN public.profiles pub ON pub.id = ch.published_by
`;

export type CreateConfigChangeInput = {
  area: string;
  payload: Record<string, unknown>;
  /** Submit for Director/Dean review immediately. */
  submit?: boolean;
};

export async function createConfigChange(
  ctx: AuthContext,
  input: CreateConfigChangeInput
): Promise<ConfigChangeView> {
  const scope = await getInstitutionWorkspaceScope(ctx);
  const institutionId = assertCanConfigureInstitution(scope);

  const area = (input.area || "").trim();
  if (!isSensitiveConfigArea(area)) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only sensitive areas (modules, security, integrations, advanced) use the review workflow"
    );
  }
  const payload = JSON.stringify(input.payload ?? {}).slice(0, 20000);
  const status: ConfigChangeStatus = input.submit ? "in_review" : "draft";

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO public.institution_config_changes
        (institution_id, area, payload, status, requested_by)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [institutionId, area, payload, status, ctx.userId]
  );

  await pool.query(
    `INSERT INTO public.institution_config_audit
        (institution_id, changed_by, area, action, status, new_value)
     VALUES ($1,$2,$3,'create_change',$4,$5)`,
    [
      institutionId,
      ctx.userId,
      area,
      status,
      JSON.stringify({ change_id: inserted.rows[0].id, status }),
    ]
  );

  return getConfigChange(ctx, inserted.rows[0].id);
}

export async function getConfigChange(
  ctx: AuthContext,
  changeId: string
): Promise<ConfigChangeView> {
  const scope = await getInstitutionWorkspaceScope(ctx);
  assertCanReadInstitutionWorkspace(scope);
  const result = await pool.query<ConfigChangeView>(
    `${SELECT_CHANGE} WHERE ch.id = $1`,
    [changeId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AuthzError("FORBIDDEN", "Config change not found");
  }
  if (
    scope.roleName !== ROLES.systemAdmin &&
    row.institution_id !== scope.institutionId
  ) {
    throw new AuthzError("FORBIDDEN", "Institution access denied");
  }
  return row;
}

export type ListConfigChangesQuery = {
  status?: string;
  limit?: number;
};

export async function listConfigChanges(
  ctx: AuthContext,
  query: ListConfigChangesQuery = {}
): Promise<ConfigChangeView[]> {
  const scope = await getInstitutionWorkspaceScope(ctx);
  assertCanReadInstitutionWorkspace(scope);
  if (!scope.institutionId) {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const params: unknown[] = [scope.institutionId];
  let statusClause = "";
  if (query.status) {
    params.push(query.status);
    statusClause = `AND ch.status = $${params.length}`;
  }
  params.push(limit);
  const result = await pool.query<ConfigChangeView>(
    `${SELECT_CHANGE}
      WHERE ch.institution_id = $1 ${statusClause}
      ORDER BY ch.created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

/**
 * Transition a config change.
 * - admin: draft → in_review; reject own draft (cancel); publish after approved.
 * - director_dean: in_review → approved | rejected.
 */
export async function transitionConfigChange(
  ctx: AuthContext,
  changeId: string,
  to: ConfigChangeStatus,
  note?: string
): Promise<ConfigChangeView> {
  const scope = await getInstitutionWorkspaceScope(ctx);
  const existing = await getConfigChange(ctx, changeId);
  const from = existing.status;

  const allowed = allowedTransition(scope.roleName, from, to);
  if (!allowed) {
    throw new AuthzError(
      "FORBIDDEN",
      `Cannot move config change from ${from} to ${to} for role ${ctx.roleName}`
    );
  }

  const institutionId = existing.institution_id;
  if (
    scope.roleName !== ROLES.systemAdmin &&
    institutionId !== scope.institutionId
  ) {
    throw new AuthzError("FORBIDDEN", "Institution access denied");
  }

  if (to === "approved" || to === "rejected") {
    assertCanApproveInstitutionConfig(scope);
  } else if (to === "in_review" || to === "published") {
    assertCanConfigureInstitution(scope);
    if (to === "published" && scope.roleName !== ROLES.admin) {
      throw new AuthzError("FORBIDDEN", "Only institution admin may publish");
    }
    if (to === "published" && from !== "approved") {
      throw new AuthzError("FORBIDDEN", "Change must be approved before publish");
    }
  }

  const noteClip = note ? note.trim().slice(0, 1000) : null;

  const updated = await pool.query<ConfigChangeRow>(
    `UPDATE public.institution_config_changes SET
        status = $2,
        reviewed_by = CASE WHEN $2 IN ('approved','rejected') THEN $3::uuid ELSE reviewed_by END,
        reviewed_at = CASE WHEN $2 IN ('approved','rejected') THEN now() ELSE reviewed_at END,
        published_by = CASE WHEN $2 = 'published' THEN $3::uuid ELSE published_by END,
        published_at = CASE WHEN $2 = 'published' THEN now() ELSE published_at END,
        review_note = COALESCE($4, review_note)
      WHERE id = $1 AND status = $5
      RETURNING *`,
    [changeId, to, ctx.userId, noteClip, from]
  );
  if (!updated.rows[0]) {
    throw new AuthzError("FORBIDDEN", "Config change status already changed");
  }

  await pool.query(
    `INSERT INTO public.institution_config_audit
        (institution_id, changed_by, area, action, status, previous_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      institutionId,
      ctx.userId,
      existing.area,
      `transition_${to}`,
      to,
      JSON.stringify({ status: from }),
      JSON.stringify({ status: to, note: noteClip }),
    ]
  );

  // Apply payload when publishing sensitive module changes.
  if (to === "published" && existing.area === "modules") {
    await applyModulePayload(ctx, institutionId, existing.payload);
  }

  return getConfigChange(ctx, changeId);
}

function allowedTransition(
  roleName: string,
  from: ConfigChangeStatus,
  to: ConfigChangeStatus
): boolean {
  if (roleName === ROLES.admin) {
    if (from === "draft" && to === "in_review") return true;
    if (from === "draft" && to === "rejected") return true; // cancel
    if (from === "approved" && to === "published") return true;
    return false;
  }
  if (roleName === ROLES.directorDean) {
    if (from === "in_review" && (to === "approved" || to === "rejected")) {
      return true;
    }
    return false;
  }
  return false;
}

async function applyModulePayload(
  ctx: AuthContext,
  institutionId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const modules = payload.modules;
  if (!modules || typeof modules !== "object") return;
  for (const [key, enabled] of Object.entries(
    modules as Record<string, unknown>
  )) {
    if (typeof enabled !== "boolean") continue;
    await pool.query(
      `INSERT INTO public.institution_modules (institution_id, module_key, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (institution_id, module_key)
       DO UPDATE SET enabled = EXCLUDED.enabled`,
      [institutionId, key, enabled]
    );
  }
  void ctx;
}
