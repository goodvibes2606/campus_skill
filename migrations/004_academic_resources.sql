-- Milestone 4 — Academic Resource Foundation
-- Additive and non-destructive. Reuses M1–M3 hierarchy.
-- Safe to re-run: DDL is IF NOT EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- academic_resources — resource metadata + full academic scope
-- Institution → University → Department → Program → Academic Year
--            → Semester → Section → Subject (subject_code via FK)
--            → optional Syllabus / Unit / Topic refs
-- Version-ready: integer version; parent_resource_id for future chains.
-- File storage NOT implemented yet (research-deferred); storage_key nullable.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.academic_resources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    university_id uuid NOT NULL REFERENCES public.universities (id),
    department_id uuid NOT NULL REFERENCES public.departments (id),
    program_id uuid NOT NULL REFERENCES public.programs (id),
    academic_year_id uuid NOT NULL REFERENCES public.academic_years (id),
    semester_id uuid NOT NULL REFERENCES public.semesters (id),
    section_id uuid NOT NULL REFERENCES public.sections (id),
    subject_id uuid NOT NULL REFERENCES public.subjects (id),

    -- optional syllabus organization (where applicable)
    syllabus_ref text,
    unit_ref text,
    topic_ref text,

    owner_id uuid NOT NULL REFERENCES public.profiles (id),

    resource_type text NOT NULL
        CHECK (resource_type IN (
            'notes', 'ppt', 'pdf', 'document', 'study_material'
        )),

    title text NOT NULL,
    description text NOT NULL DEFAULT '',

    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),

    -- version-ready structure
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    parent_resource_id uuid REFERENCES public.academic_resources (id),

    -- upload metadata foundation (bytes not persisted until storage milestone)
    original_filename text,
    mime_type text,
    size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
    storage_key text,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Institution isolation
CREATE INDEX IF NOT EXISTS academic_resources_institution_id_idx
    ON public.academic_resources (institution_id);
-- Scope indexes for visibility queries
CREATE INDEX IF NOT EXISTS academic_resources_section_id_idx
    ON public.academic_resources (section_id);
CREATE INDEX IF NOT EXISTS academic_resources_subject_id_idx
    ON public.academic_resources (subject_id);
CREATE INDEX IF NOT EXISTS academic_resources_program_id_idx
    ON public.academic_resources (program_id);
CREATE INDEX IF NOT EXISTS academic_resources_semester_id_idx
    ON public.academic_resources (semester_id);
CREATE INDEX IF NOT EXISTS academic_resources_academic_year_id_idx
    ON public.academic_resources (academic_year_id);
CREATE INDEX IF NOT EXISTS academic_resources_department_id_idx
    ON public.academic_resources (department_id);
CREATE INDEX IF NOT EXISTS academic_resources_university_id_idx
    ON public.academic_resources (university_id);
CREATE INDEX IF NOT EXISTS academic_resources_owner_id_idx
    ON public.academic_resources (owner_id);
CREATE INDEX IF NOT EXISTS academic_resources_status_idx
    ON public.academic_resources (status);
CREATE INDEX IF NOT EXISTS academic_resources_type_idx
    ON public.academic_resources (resource_type);

-- ============================================================
-- updated_at trigger
-- ============================================================
DO $$
BEGIN
    IF to_regprocedure('public.set_updated_at()') IS NULL THEN
        CREATE FUNCTION public.set_updated_at()
        RETURNS trigger LANGUAGE plpgsql AS
        $fn$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $fn$;
    END IF;

    DROP TRIGGER IF EXISTS academic_resources_set_updated_at
        ON public.academic_resources;
    CREATE TRIGGER academic_resources_set_updated_at
        BEFORE UPDATE ON public.academic_resources
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
END $$;

INSERT INTO public.schema_migrations (name)
VALUES ('004_academic_resources')
ON CONFLICT (name) DO NOTHING;

COMMIT;
