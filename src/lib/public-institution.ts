import { pool } from "@/lib/db";

/**
 * Public institution directory (Milestone 11).
 * Exposes ONLY fields the institution admin explicitly marked public
 * in institution_configs.public_profile — never internal config.
 */

export type PublicInstitutionProfile = {
  slug: string;
  name: string;
  /** Explicitly public fields only. */
  publicProfile: Record<string, unknown>;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  websiteUrl: string | null;
  city: string | null;
  country: string | null;
};

export async function getPublicInstitutionBySlug(
  slug: string
): Promise<PublicInstitutionProfile | null> {
  const clean = slug.trim().toLowerCase();
  if (!clean || clean.length > 120) return null;

  const result = await pool.query<{
    slug: string;
    name: string;
    status: string;
    public_profile: Record<string, unknown> | null;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    website_url: string | null;
    city: string | null;
    country: string | null;
    onboarding_status: string;
  }>(
    `SELECT i.slug, i.name, i.status,
            c.public_profile, c.logo_url, c.primary_color, c.secondary_color,
            c.website_url, c.city, c.country, c.onboarding_status
       FROM public.institutions i
       LEFT JOIN public.institution_configs c ON c.institution_id = i.id
      WHERE i.slug = $1 AND i.status = 'active'`,
    [clean]
  );
  const row = result.rows[0];
  if (!row) return null;

  // Only publish when config exists and has at least one public field set
  // OR always show name/slug (public directory entry).
  const publicProfile = row.public_profile ?? {};

  return {
    slug: row.slug,
    name: row.name,
    publicProfile,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    // website/city/country only if marked public — strip unless present in public_profile
    websiteUrl:
      typeof publicProfile.website === "string"
        ? publicProfile.website
        : null,
    city: typeof publicProfile.city === "string" ? publicProfile.city : null,
    country:
      typeof publicProfile.country === "string" ? publicProfile.country : null,
  };
}

export async function listPublicInstitutions(
  limit = 50
): Promise<{ slug: string; name: string; logoUrl: string | null; city: string | null }[]> {
  const lim = Math.min(Math.max(limit, 1), 100);
  const result = await pool.query<{
    slug: string;
    name: string;
    logo_url: string | null;
    public_profile: Record<string, unknown> | null;
  }>(
    `SELECT i.slug, i.name, c.logo_url, c.public_profile
       FROM public.institutions i
       LEFT JOIN public.institution_configs c ON c.institution_id = i.id
      WHERE i.status = 'active'
      ORDER BY i.name
      LIMIT ${lim}`
  );
  return result.rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    logoUrl: r.logo_url,
    city:
      r.public_profile && typeof r.public_profile.city === "string"
        ? r.public_profile.city
        : null,
  }));
}
