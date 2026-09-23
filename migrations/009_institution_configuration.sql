-- Milestone 11 — Institution Configuration, White-Label & Control Center
-- ADDITIVE and non-destructive. Reuses institutions/profiles/roles from M1–M8.
-- Safe to re-run: DDL is IF NOT EXISTS; seeds use ON CONFLICT DO NOTHING.
-- Does NOT introduce Supabase, does not touch auth.* or environment secrets.
-- Reuses public.institutions (no duplicate institution table).

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- institution_configs — 1:1 extension of public.institutions
-- Profile, contact, social, branding, public-profile flags,
-- onboarding progress. White-label foundation only (no CDN/deploy).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.institution_configs (
    institution_id uuid PRIMARY KEY
        REFERENCES public.institutions (id) ON DELETE CASCADE,

    -- --- Profile ---
    short_name text,
    institution_type text,
    about text,
    logo_url text,
    cover_image_url text,
    established_year integer
        CHECK (established_year IS NULL OR established_year BETWEEN 1000 AND 9999),
    accreditation text,
    affiliation text,

    -- --- Contact ---
    address text,
    city text,
    state text,
    country text,
    maps_url text,
    website_url text,
    official_email text,
    admission_email text,
    support_email text,
    phone text,
    contact_person_name text,
    contact_person_title text,

    -- --- Social links ---
    social_instagram text,
    social_facebook text,
    social_linkedin text,
    social_youtube text,
    social_x text,

    -- --- Branding (white-label foundation) ---
    primary_color text,
    secondary_color text,
    favicon_url text,
    login_tagline text,
    dashboard_tagline text,

    -- --- Public profile: only fields admin explicitly marks public ---
    -- Shape: { about, officialEmail, phone, address, website, mapsUrl, city, ... }
    public_profile jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- --- Onboarding foundation (no workflow engine) ---
    onboarding_status text NOT NULL DEFAULT 'draft'
        CHECK (onboarding_status IN ('draft', 'in_progress', 'ready', 'published')),
    onboarding_step integer NOT NULL DEFAULT 1
        CHECK (onboarding_step BETWEEN 1 AND 9),

    -- --- Lifecycle ---
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active')),

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS institution_configs_status_idx
    ON public.institution_configs (status);

DROP TRIGGER IF EXISTS institution_configs_set_updated_at ON public.institution_configs;
CREATE TRIGGER institution_configs_set_updated_at
    BEFORE UPDATE ON public.institution_configs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- institution_modules — institution-scoped feature/module flags
-- Server-side authz is authoritative; client hiding is UX only.
-- Missing row = module enabled (default-on for existing modules).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.institution_modules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
    module_key text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS institution_modules_inst_key_idx
    ON public.institution_modules (institution_id, module_key);
CREATE INDEX IF NOT EXISTS institution_modules_institution_id_idx
    ON public.institution_modules (institution_id);

DROP TRIGGER IF EXISTS institution_modules_set_updated_at ON public.institution_modules;
CREATE TRIGGER institution_modules_set_updated_at
    BEFORE UPDATE ON public.institution_modules
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- institution_config_changes — controlled lifecycle foundation
-- Draft → Preview/Review → Approved → Publish (for sensitive areas).
-- Documented limitation: profile/branding may be saved directly by
-- admin (with audit); modules & security-related areas use this flow.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.institution_config_changes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
    area text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'in_review', 'approved', 'published', 'rejected')),
    requested_by uuid NOT NULL REFERENCES public.profiles (id),
    reviewed_by uuid REFERENCES public.profiles (id),
    published_by uuid REFERENCES public.profiles (id),
    review_note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    published_at timestamptz
);

CREATE INDEX IF NOT EXISTS institution_config_changes_inst_status_idx
    ON public.institution_config_changes (institution_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS institution_config_changes_institution_id_idx
    ON public.institution_config_changes (institution_id);

DROP TRIGGER IF EXISTS institution_config_changes_set_updated_at ON public.institution_config_changes;
CREATE TRIGGER institution_config_changes_set_updated_at
    BEFORE UPDATE ON public.institution_config_changes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- institution_config_audit — who changed what, when
-- Stores area + action + status + value refs (jsonb, clipped).
-- Avoid unnecessary sensitive data (no secrets/passwords).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.institution_config_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
    changed_by uuid NOT NULL REFERENCES public.profiles (id),
    area text NOT NULL,
    action text NOT NULL,
    status text,
    previous_value jsonb,
    new_value jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS institution_config_audit_inst_created_idx
    ON public.institution_config_audit (institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS institution_config_audit_changed_by_idx
    ON public.institution_config_audit (changed_by);

-- ============================================================
-- Seed default module catalog for existing institutions
-- (idempotent; existing rows preserved — never auto-disable).
-- ============================================================
INSERT INTO public.institution_modules (institution_id, module_key, enabled)
SELECT i.id, m.module_key, true
  FROM public.institutions i
  CROSS JOIN (VALUES
    ('student_management'),
    ('faculty'),
    ('resources'),
    ('syllabus'),
    ('assignments'),
    ('assessments'),
    ('question_bank'),
    ('calendar'),
    ('notifications'),
    ('placement'),
    ('ai_assistance'),
    ('alumni')
  ) AS m(module_key)
WHERE NOT EXISTS (
    SELECT 1 FROM public.institution_modules im
     WHERE im.institution_id = i.id AND im.module_key = m.module_key
)
ON CONFLICT (institution_id, module_key) DO NOTHING;

INSERT INTO public.schema_migrations (name)
VALUES ('009_institution_configuration') ON CONFLICT (name) DO NOTHING;

COMMIT;
