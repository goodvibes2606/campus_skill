-- Milestone 2 — Academic Identity + RBAC Foundation
-- Additive and non-destructive. Reuses institutions, roles, profiles from 001.
-- Safe to re-run: DDL is IF NOT EXISTS; role seed is ON CONFLICT DO NOTHING.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RBAC role catalog — add missing foundation roles only
-- Existing: student, faculty, admin (from 001). Class Coordinator is
-- an assignment (section_coordinators), not a user role.
-- Placement Officer / Recruiter intentionally omitted (future).
-- ============================================================
INSERT INTO public.roles (name, description) VALUES
    ('hod', 'Head of Department'),
    ('director_dean', 'Director or Dean'),
    ('system_admin', 'Cross-institution system administrator')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- universities  (Institution → University)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.universities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    name text NOT NULL,
    code text NOT NULL,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS universities_inst_code_idx
    ON public.universities (institution_id, code);
CREATE INDEX IF NOT EXISTS universities_institution_id_idx
    ON public.universities (institution_id);

-- ============================================================
-- departments  (University → Department)
-- institution_id denormalized for isolation checks.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.departments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id uuid NOT NULL REFERENCES public.universities (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    name text NOT NULL,
    code text NOT NULL,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS departments_uni_code_idx
    ON public.departments (university_id, code);
CREATE INDEX IF NOT EXISTS departments_institution_id_idx
    ON public.departments (institution_id);

-- ============================================================
-- programs  (Department → Program/Stream)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.programs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id uuid NOT NULL REFERENCES public.departments (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    name text NOT NULL,
    code text NOT NULL,
    duration_semesters integer
        CHECK (duration_semesters IS NULL OR duration_semesters > 0),
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS programs_dept_code_idx
    ON public.programs (department_id, code);
CREATE INDEX IF NOT EXISTS programs_institution_id_idx
    ON public.programs (institution_id);

-- ============================================================
-- academic_years  (Program → Academic Year)
-- Time-bound; completed years are retained (history), never deleted.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.academic_years (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id uuid NOT NULL REFERENCES public.programs (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    name text NOT NULL,
    starts_on date,
    ends_on date,
    status text NOT NULL DEFAULT 'upcoming'
        CHECK (status IN ('upcoming', 'active', 'completed', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT academic_years_dates_ck
        CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS academic_years_program_name_idx
    ON public.academic_years (program_id, name);
CREATE INDEX IF NOT EXISTS academic_years_institution_id_idx
    ON public.academic_years (institution_id);

-- ============================================================
-- semesters  (Academic Year → Semester)
-- Instances of semesters inside a program year — history preserved.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.semesters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id uuid NOT NULL REFERENCES public.academic_years (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    semester_number integer NOT NULL CHECK (semester_number >= 1),
    name text,
    starts_on date,
    ends_on date,
    status text NOT NULL DEFAULT 'upcoming'
        CHECK (status IN ('upcoming', 'active', 'completed', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT semesters_dates_ck
        CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS semesters_year_number_idx
    ON public.semesters (academic_year_id, semester_number);
CREATE INDEX IF NOT EXISTS semesters_institution_id_idx
    ON public.semesters (institution_id);

-- ============================================================
-- sections  (Semester → Section/Class)
-- coordinator_id = current class coordinator (faculty assignment,
-- not a separate account type). History lives in section_coordinators.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    semester_id uuid NOT NULL REFERENCES public.semesters (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    name text NOT NULL,
    coordinator_id uuid REFERENCES public.profiles (id),
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sections_semester_name_idx
    ON public.sections (semester_id, name);
CREATE INDEX IF NOT EXISTS sections_institution_id_idx
    ON public.sections (institution_id);
CREATE INDEX IF NOT EXISTS sections_coordinator_id_idx
    ON public.sections (coordinator_id);

-- ============================================================
-- section_coordinators — handover history (append-friendly)
-- valid_to IS NULL → current assignment. Closing a row preserves history.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.section_coordinators (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id uuid NOT NULL REFERENCES public.sections (id),
    coordinator_id uuid NOT NULL REFERENCES public.profiles (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    assigned_by uuid REFERENCES public.profiles (id),
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_to timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT section_coordinators_window_ck
        CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- At most one current coordinator per section
CREATE UNIQUE INDEX IF NOT EXISTS section_coordinators_current_idx
    ON public.section_coordinators (section_id)
    WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS section_coordinators_institution_id_idx
    ON public.section_coordinators (institution_id);
CREATE INDEX IF NOT EXISTS section_coordinators_coordinator_id_idx
    ON public.section_coordinators (coordinator_id);

-- ============================================================
-- subjects  (curriculum catalog under Program; includes Subject Code)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id uuid NOT NULL REFERENCES public.programs (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    name text NOT NULL,
    subject_code text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subjects_program_code_idx
    ON public.subjects (program_id, subject_code);
CREATE INDEX IF NOT EXISTS subjects_institution_id_idx
    ON public.subjects (institution_id);

-- ============================================================
-- section_subjects  (Section → Subject link + faculty-subject assignment)
-- Completes hierarchy Section → Subject without duplicating curriculum rows.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.section_subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id uuid NOT NULL REFERENCES public.sections (id),
    subject_id uuid NOT NULL REFERENCES public.subjects (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    faculty_id uuid REFERENCES public.profiles (id),
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS section_subjects_section_subject_idx
    ON public.section_subjects (section_id, subject_id);
CREATE INDEX IF NOT EXISTS section_subjects_institution_id_idx
    ON public.section_subjects (institution_id);
CREATE INDEX IF NOT EXISTS section_subjects_faculty_id_idx
    ON public.section_subjects (faculty_id);

-- ============================================================
-- updated_at triggers (idempotent) — reuse public.set_updated_at from 001
-- ============================================================
DO $$
DECLARE
    t text;
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

    FOREACH t IN ARRAY ARRAY[
        'universities', 'departments', 'programs', 'academic_years',
        'semesters', 'sections', 'subjects', 'section_subjects'
    ] LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON public.%I;
             CREATE TRIGGER %I BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
            t || '_set_updated_at', t,
            t || '_set_updated_at', t
        );
    END LOOP;
END $$;

INSERT INTO public.schema_migrations (name)
VALUES ('002_academic_hierarchy_rbac')
ON CONFLICT (name) DO NOTHING;

COMMIT;
