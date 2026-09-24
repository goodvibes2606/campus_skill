-- Milestone 12 — Account lifecycle, files, import/export, announcements, consent
-- ADDITIVE and non-destructive. Safe to re-run: DDL IF NOT EXISTS; seeds ON CONFLICT.
-- Does NOT introduce Supabase; does not touch auth.* or environment secrets.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Account lifecycle — extend profiles.status check
-- active / suspended / inactive / graduated / left
-- (keep pending + deactivated for existing rows / compatibility)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_status_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_status_check;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN (
    'pending', 'active', 'suspended', 'inactive',
    'graduated', 'left', 'deactivated'
  ));

-- ============================================================
-- file_objects — blob storage foundation (metadata only row;
-- bytes live in provider — abstraction, not hard-coded vendor)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.file_objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
    uploaded_by uuid NOT NULL REFERENCES public.profiles (id),
    owner_type text NOT NULL DEFAULT 'resource'
        CHECK (owner_type IN ('resource', 'submission', 'announcement', 'import', 'export', 'avatar', 'other')),
    owner_id uuid,
    original_name text NOT NULL,
    content_type text NOT NULL,
    size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
    checksum_sha256 text,
    storage_provider text NOT NULL DEFAULT 'local_metadata',
    storage_key text NOT NULL,
    visibility text NOT NULL DEFAULT 'institution'
        CHECK (visibility IN ('private', 'institution', 'academic')),
    scope_department_id uuid,
    scope_section_id uuid,
    scope_subject_id uuid,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deleted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS file_objects_institution_id_idx
    ON public.file_objects (institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS file_objects_owner_idx
    ON public.file_objects (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS file_objects_uploaded_by_idx
    ON public.file_objects (uploaded_by);

DROP TRIGGER IF EXISTS file_objects_set_updated_at ON public.file_objects;
CREATE TRIGGER file_objects_set_updated_at
    BEFORE UPDATE ON public.file_objects
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- import_jobs / import_rows — Upload → Validate → Preview → Approve → Import → Audit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
    entity_type text NOT NULL
        CHECK (entity_type IN (
            'students','faculty','departments','programs','subjects','sections','structure'
        )),
    file_object_id uuid REFERENCES public.file_objects (id),
    original_filename text,
    format text NOT NULL DEFAULT 'csv' CHECK (format IN ('csv','xlsx','tsv')),
    status text NOT NULL DEFAULT 'uploaded'
        CHECK (status IN (
            'uploaded','validated','previewed','approved','rejected',
            'importing','completed','failed'
        )),
    created_by uuid NOT NULL REFERENCES public.profiles (id),
    approved_by uuid REFERENCES public.profiles (id),
    total_rows integer NOT NULL DEFAULT 0,
    valid_rows integer NOT NULL DEFAULT 0,
    error_rows integer NOT NULL DEFAULT 0,
    imported_rows integer NOT NULL DEFAULT 0,
    validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_jobs_inst_status_idx
    ON public.import_jobs (institution_id, status, created_at DESC);

DROP TRIGGER IF EXISTS import_jobs_set_updated_at ON public.import_jobs;
CREATE TRIGGER import_jobs_set_updated_at
    BEFORE UPDATE ON public.import_jobs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.import_rows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id uuid NOT NULL REFERENCES public.import_jobs (id) ON DELETE CASCADE,
    institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
    row_number integer NOT NULL,
    raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    mapped_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','valid','error','imported','skipped')),
    errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_rows_job_idx
    ON public.import_rows (import_job_id, row_number);
CREATE UNIQUE INDEX IF NOT EXISTS import_rows_job_row_idx
    ON public.import_rows (import_job_id, row_number);

-- ============================================================
-- export_jobs — controlled data export + audit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.export_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
    entity_type text NOT NULL,
    format text NOT NULL DEFAULT 'csv' CHECK (format IN ('csv','xlsx','json')),
    status text NOT NULL DEFAULT 'completed'
        CHECK (status IN ('pending','completed','failed','denied')),
    row_count integer NOT NULL DEFAULT 0,
    requested_by uuid NOT NULL REFERENCES public.profiles (id),
    filters jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS export_jobs_inst_created_idx
    ON public.export_jobs (institution_id, created_at DESC);

-- ============================================================
-- announcements + audience scopes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
    title text NOT NULL,
    body text NOT NULL DEFAULT '',
    priority text NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low','normal','high','urgent')),
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','published','archived')),
    audience_kind text NOT NULL DEFAULT 'institution'
        CHECK (audience_kind IN (
            'institution','department','program','semester','section','faculty','students'
        )),
    department_id uuid,
    program_id uuid,
    semester_id uuid,
    section_id uuid,
    start_at timestamptz,
    end_at timestamptz,
    created_by uuid NOT NULL REFERENCES public.profiles (id),
    published_by uuid REFERENCES public.profiles (id),
    published_at timestamptz,
    notify_recipients boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_inst_status_idx
    ON public.announcements (institution_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS announcements_audience_idx
    ON public.announcements (audience_kind, department_id, section_id);

DROP TRIGGER IF EXISTS announcements_set_updated_at ON public.announcements;
CREATE TRIGGER announcements_set_updated_at
    BEFORE UPDATE ON public.announcements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- privacy_consents — user privacy/AI notice acknowledgement
-- ============================================================
CREATE TABLE IF NOT EXISTS public.privacy_consents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    institution_id uuid REFERENCES public.institutions (id) ON DELETE SET NULL,
    kind text NOT NULL
        CHECK (kind IN ('privacy_notice','data_handling','ai_notice','terms_ack')),
    version text NOT NULL DEFAULT '1',
    accepted boolean NOT NULL DEFAULT false,
    accepted_at timestamptz,
    ip_hash text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS privacy_consents_user_kind_ver_idx
    ON public.privacy_consents (user_id, kind, version);
CREATE INDEX IF NOT EXISTS privacy_consents_user_idx
    ON public.privacy_consents (user_id, accepted_at DESC);

DROP TRIGGER IF EXISTS privacy_consents_set_updated_at ON public.privacy_consents;
CREATE TRIGGER privacy_consents_set_updated_at
    BEFORE UPDATE ON public.privacy_consents
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- institution privacy wording (configurable, non-legal defaults)
-- ============================================================
ALTER TABLE public.institution_configs
    ADD COLUMN IF NOT EXISTS privacy_notice text,
    ADD COLUMN IF NOT EXISTS ai_notice text,
    ADD COLUMN IF NOT EXISTS data_handling_notice text,
    ADD COLUMN IF NOT EXISTS terms_ack_text text;

INSERT INTO public.schema_migrations (name)
VALUES ('012_account_lifecycle_platform') ON CONFLICT (name) DO NOTHING;

COMMIT;
