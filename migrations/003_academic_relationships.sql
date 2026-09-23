-- Milestone 3 — Student + Faculty Academic Relationships
-- Additive and non-destructive. Reuses M1/M2 structures.
-- Safe to re-run: DDL is IF NOT EXISTS; no destructive changes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- student_enrollments — history-preserving enrollment
-- Student → Institution → Program → Academic Year → Semester → Section
-- Only one ACTIVE enrollment per student (partial unique index).
-- Past enrollments are retained with status + ended_at (never deleted).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_enrollments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.profiles (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    program_id uuid NOT NULL REFERENCES public.programs (id),
    academic_year_id uuid NOT NULL REFERENCES public.academic_years (id),
    semester_id uuid NOT NULL REFERENCES public.semesters (id),
    section_id uuid NOT NULL REFERENCES public.sections (id),
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'dropped', 'transferred')),
    enrolled_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    enrolled_by uuid REFERENCES public.profiles (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT student_enrollments_end_ck
        CHECK (ended_at IS NULL OR ended_at >= enrolled_at),
    CONSTRAINT student_enrollments_status_end_ck
        CHECK (
            (status = 'active' AND ended_at IS NULL)
            OR (status <> 'active' AND ended_at IS NOT NULL)
        )
);

-- At most one active enrollment per student
CREATE UNIQUE INDEX IF NOT EXISTS student_enrollments_active_idx
    ON public.student_enrollments (student_id)
    WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS student_enrollments_section_student_active_idx
    ON public.student_enrollments (section_id, student_id)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS student_enrollments_student_id_idx
    ON public.student_enrollments (student_id);
CREATE INDEX IF NOT EXISTS student_enrollments_institution_id_idx
    ON public.student_enrollments (institution_id);
CREATE INDEX IF NOT EXISTS student_enrollments_section_id_idx
    ON public.student_enrollments (section_id);
CREATE INDEX IF NOT EXISTS student_enrollments_program_id_idx
    ON public.student_enrollments (program_id);
CREATE INDEX IF NOT EXISTS student_enrollments_academic_year_id_idx
    ON public.student_enrollments (academic_year_id);
CREATE INDEX IF NOT EXISTS student_enrollments_semester_id_idx
    ON public.student_enrollments (semester_id);

-- ============================================================
-- faculty_assignments — history-preserving teaching assignment
-- Faculty → Institution → Department → Program → Academic Year
--        → Semester → Section → Subject → Subject Code
-- subject_code is read from subjects.subject_code (not duplicated).
-- Multiple concurrent active assignments allowed (one per subject/section).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.faculty_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id uuid NOT NULL REFERENCES public.profiles (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    department_id uuid NOT NULL REFERENCES public.departments (id),
    program_id uuid NOT NULL REFERENCES public.programs (id),
    academic_year_id uuid NOT NULL REFERENCES public.academic_years (id),
    semester_id uuid NOT NULL REFERENCES public.semesters (id),
    section_id uuid NOT NULL REFERENCES public.sections (id),
    subject_id uuid NOT NULL REFERENCES public.subjects (id),
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'ended', 'transferred')),
    assigned_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    assigned_by uuid REFERENCES public.profiles (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT faculty_assignments_end_ck
        CHECK (ended_at IS NULL OR ended_at >= assigned_at),
    CONSTRAINT faculty_assignments_status_end_ck
        CHECK (
            (status = 'active' AND ended_at IS NULL)
            OR (status <> 'active' AND ended_at IS NOT NULL)
        )
);

-- One active assignment per faculty+section+subject
CREATE UNIQUE INDEX IF NOT EXISTS faculty_assignments_active_idx
    ON public.faculty_assignments (faculty_id, section_id, subject_id)
    WHERE status = 'active';
-- One faculty actively teaching a subject in a section
CREATE UNIQUE INDEX IF NOT EXISTS faculty_assignments_section_subject_idx
    ON public.faculty_assignments (section_id, subject_id)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS faculty_assignments_faculty_id_idx
    ON public.faculty_assignments (faculty_id);
CREATE INDEX IF NOT EXISTS faculty_assignments_institution_id_idx
    ON public.faculty_assignments (institution_id);
CREATE INDEX IF NOT EXISTS faculty_assignments_department_id_idx
    ON public.faculty_assignments (department_id);
CREATE INDEX IF NOT EXISTS faculty_assignments_section_id_idx
    ON public.faculty_assignments (section_id);
CREATE INDEX IF NOT EXISTS faculty_assignments_subject_id_idx
    ON public.faculty_assignments (subject_id);

-- ============================================================
-- department_heads — HOD authorization scope with handover history
-- valid_to IS NULL → current HOD. Closing preserves history.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.department_heads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id uuid NOT NULL REFERENCES public.departments (id),
    hod_id uuid NOT NULL REFERENCES public.profiles (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    assigned_by uuid REFERENCES public.profiles (id),
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_to timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT department_heads_window_ck
        CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- At most one current HOD per department
CREATE UNIQUE INDEX IF NOT EXISTS department_heads_current_idx
    ON public.department_heads (department_id)
    WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS department_heads_hod_id_idx
    ON public.department_heads (hod_id);
CREATE INDEX IF NOT EXISTS department_heads_institution_id_idx
    ON public.department_heads (institution_id);

-- ============================================================
-- updated_at triggers for new tables
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
        'student_enrollments', 'faculty_assignments'
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
VALUES ('003_academic_relationships')
ON CONFLICT (name) DO NOTHING;

COMMIT;
