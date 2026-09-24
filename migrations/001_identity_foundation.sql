-- Milestone 1 — Identity Foundation (additive, non-destructive)
-- Reuses existing auth schema (already applied on Neon). Does not touch auth.* tables.
-- Safe to re-run: all DDL uses IF NOT EXISTS; seed uses ON CONFLICT DO NOTHING.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- institutions — top-level tenant (foundation only; no seed data)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.institutions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL,
    address text,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS institutions_slug_idx
    ON public.institutions (slug);

-- ============================================================
-- roles — catalog; names are assignable (not hard-coded in app architecture)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS roles_name_idx
    ON public.roles (name);

-- Seed only the three MVP catalog entries. Additional roles (hod,
-- coordinator, director, placement_officer, recruiter, …) are added later
-- via the RBAC system — nothing in application code hard-codes this list
-- as the only possible roles.
INSERT INTO public.roles (name, description) VALUES
    ('student', 'Default role for newly registered users; changeable via institutional RBAC'),
    ('faculty', 'Teaching faculty member'),
    ('admin', 'Institution administrator')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- profiles — 1:1 with auth.user.id; application identity + affiliation
-- institution_id left NULL (pending) until institutional assignment.
-- role_id references roles catalog (changeable; default applied at bootstrap).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.user (id) ON DELETE CASCADE,
    institution_id uuid REFERENCES public.institutions (id) ON DELETE SET NULL,
    role_id uuid NOT NULL REFERENCES public.roles (id),
    full_name text NOT NULL DEFAULT '',
    email text NOT NULL,
    avatar_url text,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('pending', 'active', 'suspended', 'deactivated')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_idx
    ON public.profiles (email);
CREATE INDEX IF NOT EXISTS profiles_institution_id_idx
    ON public.profiles (institution_id);
CREATE INDEX IF NOT EXISTS profiles_role_id_idx
    ON public.profiles (role_id);
CREATE INDEX IF NOT EXISTS profiles_status_idx
    ON public.profiles (status);

-- updated_at trigger (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS institutions_set_updated_at ON public.institutions;
CREATE TRIGGER institutions_set_updated_at
    BEFORE UPDATE ON public.institutions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS roles_set_updated_at ON public.roles;
CREATE TRIGGER roles_set_updated_at
    BEFORE UPDATE ON public.roles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.schema_migrations (name)
VALUES ('001_identity_foundation')
ON CONFLICT (name) DO NOTHING;

COMMIT;
