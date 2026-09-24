import { pool } from "@/lib/db";
import { AuthzError, type AuthContext } from "@/lib/authz";
import {
  assertCanConfigureInstitution,
  assertCanReadInstitutionWorkspace,
  assertInstitutionWorkspaceRow,
  getInstitutionWorkspaceScope,
  type InstitutionWorkspaceScope,
} from "@/lib/institution-scope";

/**
 * Institution configuration services (Milestone 11).
 * Institution-isolated; client-supplied institution_id is never trusted.
 */

export type InstitutionConfigRow = {
  institution_id: string;
  short_name: string | null;
  institution_type: string | null;
  about: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  established_year: number | null;
  accreditation: string | null;
  affiliation: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  maps_url: string | null;
  website_url: string | null;
  official_email: string | null;
  admission_email: string | null;
  support_email: string | null;
  phone: string | null;
  contact_person_name: string | null;
  contact_person_title: string | null;
  social_instagram: string | null;
  social_facebook: string | null;
  social_linkedin: string | null;
  social_youtube: string | null;
  social_x: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  favicon_url: string | null;
  login_tagline: string | null;
  dashboard_tagline: string | null;
  public_profile: Record<string, unknown>;
  onboarding_status: string;
  onboarding_step: number;
  status: string;
  privacy_notice: string | null;
  ai_notice: string | null;
  data_handling_notice: string | null;
  terms_ack_text: string | null;
  created_at: Date;
  updated_at: Date;
};

export type InstitutionSummary = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  status: string;
};

export class InstitutionConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstitutionConfigValidationError";
  }
}

function clip(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > max) {
    throw new InstitutionConfigValidationError(
      `Value exceeds ${max} characters`
    );
  }
  return s;
}

function optionalInt(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new InstitutionConfigValidationError("Established year must be a whole number");
  }
  return n;
}

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

function optionalColor(value: unknown): string | null {
  const s = clip(value, 20);
  if (!s) return null;
  if (!HEX_COLOR.test(s)) {
    throw new InstitutionConfigValidationError("Colors must be hex (e.g. #0F766E)");
  }
  return s;
}

export async function getInstitutionSummary(
  institutionId: string
): Promise<InstitutionSummary | null> {
  const result = await pool.query<InstitutionSummary>(
    `SELECT id, name, slug, address, status
       FROM public.institutions WHERE id = $1`,
    [institutionId]
  );
  return result.rows[0] ?? null;
}

/** Load config row for an institution (auto-creates empty row if missing). */
export async function ensureInstitutionConfig(
  institutionId: string
): Promise<InstitutionConfigRow> {
  const existing = await pool.query<InstitutionConfigRow>(
    `SELECT * FROM public.institution_configs WHERE institution_id = $1`,
    [institutionId]
  );
  const row = existing.rows[0];
  if (row) return row;

  const inserted = await pool.query<InstitutionConfigRow>(
    `INSERT INTO public.institution_configs (institution_id)
     VALUES ($1)
     ON CONFLICT (institution_id) DO UPDATE SET institution_id = EXCLUDED.institution_id
     RETURNING *`,
    [institutionId]
  );
  return inserted.rows[0];
}

export type InstitutionWorkspaceData = {
  scope: InstitutionWorkspaceScope;
  institution: InstitutionSummary;
  config: InstitutionConfigRow;
  moduleCount: number;
  pendingChangeCount: number;
  onboardingPercent: number;
};

export function computeOnboardingPercent(config: InstitutionConfigRow): number {
  const checks = [
    Boolean(config.short_name || config.logo_url),
    Boolean(config.about),
    Boolean(config.address || config.city),
    Boolean(config.official_email || config.phone),
    Boolean(config.website_url || config.contact_person_name),
    Boolean(config.primary_color || config.login_tagline),
    config.onboarding_status !== "draft",
    config.onboarding_status === "ready" || config.onboarding_status === "published",
    config.status === "active",
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

/** Load full workspace context for the caller's institution (or system_admin target). */
export async function loadInstitutionWorkspace(
  ctx: AuthContext,
  targetInstitutionId?: string
): Promise<InstitutionWorkspaceData> {
  const scope = await getInstitutionWorkspaceScope(ctx);
  assertCanReadInstitutionWorkspace(scope);

  let institutionId = targetInstitutionId;
  if (!institutionId) {
    if (!scope.institutionId) {
      throw new AuthzError("NO_INSTITUTION", "No institution assigned");
    }
    institutionId = scope.institutionId;
  } else if (scope.roleName !== "system_admin" && scope.institutionId !== institutionId) {
    throw new AuthzError("FORBIDDEN", "Institution access denied");
  }

  const institution = await getInstitutionSummary(institutionId);
  if (!institution) {
    throw new AuthzError("FORBIDDEN", "Institution not found");
  }
  assertInstitutionWorkspaceRow(scope, institution.id);

  const config = await ensureInstitutionConfig(institution.id);

  const [moduleRes, changeRes] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.institution_modules
        WHERE institution_id = $1`,
      [institution.id]
    ),
    pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.institution_config_changes
        WHERE institution_id = $1 AND status IN ('draft', 'in_review', 'approved')`,
      [institution.id]
    ),
  ]);

  return {
    scope,
    institution,
    config,
    moduleCount: Number(moduleRes.rows[0]?.count ?? 0),
    pendingChangeCount: Number(changeRes.rows[0]?.count ?? 0),
    onboardingPercent: computeOnboardingPercent(config),
  };
}

export type UpdateProfileInput = {
  shortName?: string;
  institutionType?: string;
  about?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  establishedYear?: unknown;
  accreditation?: string;
  affiliation?: string;
};

export type UpdateContactInput = {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  mapsUrl?: string;
  websiteUrl?: string;
  officialEmail?: string;
  admissionEmail?: string;
  supportEmail?: string;
  phone?: string;
  contactPersonName?: string;
  contactPersonTitle?: string;
  socialInstagram?: string;
  socialFacebook?: string;
  socialLinkedin?: string;
  socialYoutube?: string;
  socialX?: string;
};

export type UpdateBrandingInput = {
  primaryColor?: string;
  secondaryColor?: string;
  faviconUrl?: string;
  loginTagline?: string;
  dashboardTagline?: string;
};

export type UpdatePublicProfileInput = {
  publicProfile: Record<string, unknown>;
};

export type UpdateOnboardingInput = {
  onboardingStatus?: string;
  onboardingStep?: number;
};

export type UpdatePrivacyInput = {
  privacyNotice?: string;
  aiNotice?: string;
  dataHandlingNotice?: string;
  termsAckText?: string;
};

const PROFILE_COLUMNS: Record<string, string> = {
  shortName: "short_name",
  institutionType: "institution_type",
  about: "about",
  logoUrl: "logo_url",
  coverImageUrl: "cover_image_url",
  accreditation: "accreditation",
  affiliation: "affiliation",
};

const CONTACT_COLUMNS: Record<string, string> = {
  address: "address",
  city: "city",
  state: "state",
  country: "country",
  mapsUrl: "maps_url",
  websiteUrl: "website_url",
  officialEmail: "official_email",
  admissionEmail: "admission_email",
  supportEmail: "support_email",
  phone: "phone",
  contactPersonName: "contact_person_name",
  contactPersonTitle: "contact_person_title",
  socialInstagram: "social_instagram",
  socialFacebook: "social_facebook",
  socialLinkedin: "social_linkedin",
  socialYoutube: "social_youtube",
  socialX: "social_x",
};

const BRANDING_COLUMNS: Record<string, string> = {
  primaryColor: "primary_color",
  secondaryColor: "secondary_color",
  faviconUrl: "favicon_url",
  loginTagline: "login_tagline",
  dashboardTagline: "dashboard_tagline",
};

const TEXT_MAX: Record<string, number> = {
  short_name: 40,
  institution_type: 80,
  about: 4000,
  logo_url: 500,
  cover_image_url: 500,
  accreditation: 300,
  affiliation: 300,
  address: 500,
  city: 100,
  state: 100,
  country: 100,
  maps_url: 500,
  website_url: 500,
  official_email: 200,
  admission_email: 200,
  support_email: 200,
  phone: 50,
  contact_person_name: 120,
  contact_person_title: 120,
  social_instagram: 300,
  social_facebook: 300,
  social_linkedin: 300,
  social_youtube: 300,
  social_x: 300,
  favicon_url: 500,
  login_tagline: 200,
  dashboard_tagline: 200,
  privacy_notice: 8000,
  ai_notice: 8000,
  data_handling_notice: 8000,
  terms_ack_text: 8000,
};

function buildUpdate(
  columns: Record<string, string>,
  input: Record<string, unknown>
): { sets: string[]; params: unknown[] } {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of Object.entries(columns)) {
    if (input[key] === undefined) continue;
    params.push(clip(input[key], TEXT_MAX[col] ?? 500));
    sets.push(`${col} = $${params.length}`);
  }
  return { sets, params };
}

async function applyConfigUpdate(
  ctx: AuthContext,
  area: string,
  build: () => { sets: string[]; params: unknown[] }
): Promise<InstitutionConfigRow> {
  const scope = await getInstitutionWorkspaceScope(ctx);
  const institutionId = assertCanConfigureInstitution(scope);
  const before = await ensureInstitutionConfig(institutionId);
  const { sets, params } = build();

  if (sets.length === 0) {
    throw new InstitutionConfigValidationError("Nothing to update");
  }

  params.push(institutionId);
  const updated = await pool.query<InstitutionConfigRow>(
    `UPDATE public.institution_configs
        SET ${sets.join(", ")}
      WHERE institution_id = $${params.length}
      RETURNING *`,
    params
  );
  const after = updated.rows[0];
  if (!after) {
    throw new AuthzError("FORBIDDEN", "Config not found");
  }

  await recordAudit(ctx, {
    institutionId,
    area,
    action: "update",
    status: after.status,
    previousValue: pickAuditSlice(before, area),
    newValue: pickAuditSlice(after, area),
  });

  return after;
}

function pickAuditSlice(
  row: InstitutionConfigRow,
  area: string
): Record<string, unknown> {
  if (area === "profile") {
    return {
      short_name: row.short_name,
      institution_type: row.institution_type,
      about: row.about,
      logo_url: row.logo_url,
      established_year: row.established_year,
      accreditation: row.accreditation,
      affiliation: row.affiliation,
    };
  }
  if (area === "contact") {
    return {
      address: row.address,
      city: row.city,
      official_email: row.official_email,
      phone: row.phone,
      website_url: row.website_url,
    };
  }
  if (area === "branding") {
    return {
      primary_color: row.primary_color,
      secondary_color: row.secondary_color,
      login_tagline: row.login_tagline,
      favicon_url: row.favicon_url,
    };
  }
  if (area === "public_profile") {
    return { public_profile: row.public_profile };
  }
  if (area === "onboarding") {
    return {
      onboarding_status: row.onboarding_status,
      onboarding_step: row.onboarding_step,
      status: row.status,
    };
  }
  if (area === "privacy") {
    return {
      privacy_notice: row.privacy_notice,
      ai_notice: row.ai_notice,
      data_handling_notice: row.data_handling_notice,
      terms_ack_text: row.terms_ack_text,
    };
  }
  return {};
}

export async function updateInstitutionProfile(
  ctx: AuthContext,
  input: UpdateProfileInput
): Promise<InstitutionConfigRow> {
  return applyConfigUpdate(ctx, "profile", () => {
    const { sets, params } = buildUpdate(PROFILE_COLUMNS, input);
    if (input.establishedYear !== undefined) {
      params.push(optionalInt(input.establishedYear));
      sets.push(`established_year = $${params.length}`);
    }
    return { sets, params };
  });
}

export async function updateInstitutionContact(
  ctx: AuthContext,
  input: UpdateContactInput
): Promise<InstitutionConfigRow> {
  return applyConfigUpdate(ctx, "contact", () =>
    buildUpdate(CONTACT_COLUMNS, input)
  );
}

export async function updateInstitutionBranding(
  ctx: AuthContext,
  input: UpdateBrandingInput
): Promise<InstitutionConfigRow> {
  return applyConfigUpdate(ctx, "branding", () => {
    const primary =
      input.primaryColor !== undefined
        ? optionalColor(input.primaryColor)
        : undefined;
    const secondary =
      input.secondaryColor !== undefined
        ? optionalColor(input.secondaryColor)
        : undefined;
    const { sets, params } = buildUpdate(BRANDING_COLUMNS, {
      primaryColor: primary,
      secondaryColor: secondary,
      faviconUrl: input.faviconUrl,
      loginTagline: input.loginTagline,
      dashboardTagline: input.dashboardTagline,
    });
    return { sets, params };
  });
}

/** Public profile: only explicitly selected keys are stored/exposed. */
const ALLOWED_PUBLIC_KEYS = [
  "about",
  "officialEmail",
  "phone",
  "address",
  "city",
  "state",
  "country",
  "website",
  "mapsUrl",
  "logoUrl",
  "shortName",
  "institutionType",
  "establishedYear",
  "accreditation",
  "contactPersonName",
  "contactPersonTitle",
  "supportEmail",
  "admissionEmail",
] as const;

export async function updateInstitutionPublicProfile(
  ctx: AuthContext,
  input: UpdatePublicProfileInput
): Promise<InstitutionConfigRow> {
  const raw = input.publicProfile ?? {};
  const clean: Record<string, unknown> = {};
  for (const key of ALLOWED_PUBLIC_KEYS) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") {
      clean[key] = clip(raw[key], 500);
    }
  }
  return applyConfigUpdate(ctx, "public_profile", () => ({
    sets: ["public_profile = $1"],
    params: [clean],
  }));
}

export async function updateInstitutionOnboarding(
  ctx: AuthContext,
  input: UpdateOnboardingInput
): Promise<InstitutionConfigRow> {
  const allowed = ["draft", "in_progress", "ready", "published"];
  return applyConfigUpdate(ctx, "onboarding", () => {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.onboardingStatus !== undefined) {
      if (!allowed.includes(input.onboardingStatus)) {
        throw new InstitutionConfigValidationError("Invalid onboarding status");
      }
      params.push(input.onboardingStatus);
      sets.push(`onboarding_status = $${params.length}`);
      if (input.onboardingStatus === "published") {
        params.push("active");
        sets.push(`status = $${params.length}`);
      }
    }
    if (input.onboardingStep !== undefined) {
      const step = Number(input.onboardingStep);
      if (!Number.isInteger(step) || step < 1 || step > 9) {
        throw new InstitutionConfigValidationError("Onboarding step must be 1–9");
      }
      params.push(step);
      sets.push(`onboarding_step = $${params.length}`);
    }
    return { sets, params };
  });
}

export async function updateInstitutionPrivacy(
  ctx: AuthContext,
  input: UpdatePrivacyInput
): Promise<InstitutionConfigRow> {
  return applyConfigUpdate(ctx, "privacy", () => {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.privacyNotice !== undefined) {
      params.push(clip(input.privacyNotice, 8000));
      sets.push(`privacy_notice = $${params.length}`);
    }
    if (input.aiNotice !== undefined) {
      params.push(clip(input.aiNotice, 8000));
      sets.push(`ai_notice = $${params.length}`);
    }
    if (input.dataHandlingNotice !== undefined) {
      params.push(clip(input.dataHandlingNotice, 8000));
      sets.push(`data_handling_notice = $${params.length}`);
    }
    if (input.termsAckText !== undefined) {
      params.push(clip(input.termsAckText, 8000));
      sets.push(`terms_ack_text = $${params.length}`);
    }
    return { sets, params };
  });
}

async function recordAudit(
  ctx: AuthContext,
  input: {
    institutionId: string;
    area: string;
    action: string;
    status?: string;
    previousValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO public.institution_config_audit
        (institution_id, changed_by, area, action, status, previous_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.institutionId,
      ctx.userId,
      input.area,
      input.action,
      input.status ?? null,
      input.previousValue ? JSON.stringify(input.previousValue).slice(0, 8000) : null,
      input.newValue ? JSON.stringify(input.newValue).slice(0, 8000) : null,
    ]
  );
}

export type AuditRow = {
  id: string;
  institution_id: string;
  changed_by: string;
  area: string;
  action: string;
  status: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: Date;
  changed_by_name: string;
};

export async function listConfigAudit(
  ctx: AuthContext,
  limit = 50
): Promise<AuditRow[]> {
  const scope = await getInstitutionWorkspaceScope(ctx);
  assertCanReadInstitutionWorkspace(scope);
  if (!scope.canViewAudit) {
    throw new AuthzError("FORBIDDEN", "Audit trail not available for your role");
  }
  const institutionId = scope.institutionId;
  if (!institutionId && scope.roleName !== "system_admin") {
    throw new AuthzError("NO_INSTITUTION", "No institution assigned");
  }

  const lim = Math.min(Math.max(limit, 1), 100);
  if (institutionId) {
    const result = await pool.query<AuditRow>(
      `SELECT a.*, p.full_name AS changed_by_name
         FROM public.institution_config_audit a
         JOIN public.profiles p ON p.id = a.changed_by
        WHERE a.institution_id = $1
        ORDER BY a.created_at DESC
        LIMIT ${lim}`,
      [institutionId]
    );
    return result.rows;
  }
  // system_admin without institution: empty (technical read of own institution only)
  return [];
}

/** Branding payload for layout (server-only; colors validated). */
export type BrandingPayload = {
  institutionName: string;
  shortName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  faviconUrl: string | null;
  loginTagline: string | null;
  dashboardTagline: string | null;
};

export async function getInstitutionBranding(
  institutionId: string
): Promise<BrandingPayload | null> {
  const result = await pool.query<{
    name: string;
    short_name: string | null;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    favicon_url: string | null;
    login_tagline: string | null;
    dashboard_tagline: string | null;
  }>(
    `SELECT i.name,
            c.short_name, c.logo_url, c.primary_color, c.secondary_color,
            c.favicon_url, c.login_tagline, c.dashboard_tagline
       FROM public.institutions i
       LEFT JOIN public.institution_configs c ON c.institution_id = i.id
      WHERE i.id = $1`,
    [institutionId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    institutionName: row.name,
    shortName: row.short_name,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    faviconUrl: row.favicon_url,
    loginTagline: row.login_tagline,
    dashboardTagline: row.dashboard_tagline,
  };
}
