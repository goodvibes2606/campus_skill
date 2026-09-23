-- Milestone 6 — Academic Assessment
-- Course assignments, student submissions (history-preserving), faculty review,
-- question bank, question papers (lifecycle + approval), MST-1 / MST-2 records.
-- ADDITIVE and non-destructive. Reuses M1–M5 hierarchy.
-- Does NOT use table name "assessments" (reserved in DATABASE_SPEC §2 for
-- case-study simulator attempts).
-- Safe to re-run: DDL is IF NOT EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- assignments — course assignment (full academic scope chain)
-- Distinct from faculty_assignments (teaching assignment).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    university_id uuid NOT NULL REFERENCES public.universities (id),
    department_id uuid NOT NULL REFERENCES public.departments (id),
    program_id uuid NOT NULL REFERENCES public.programs (id),
    academic_year_id uuid NOT NULL REFERENCES public.academic_years (id),
    semester_id uuid NOT NULL REFERENCES public.semesters (id),
    section_id uuid NOT NULL REFERENCES public.sections (id),
    subject_id uuid NOT NULL REFERENCES public.subjects (id),

    owner_id uuid NOT NULL REFERENCES public.profiles (id),
    created_by uuid NOT NULL REFERENCES public.profiles (id),

    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    instructions text NOT NULL DEFAULT '',

    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'closed', 'archived')),

    due_at timestamptz,
    max_points integer CHECK (max_points IS NULL OR max_points > 0),
    allow_resubmit boolean NOT NULL DEFAULT false,

    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),

    published_by uuid REFERENCES public.profiles (id),
    published_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT assignments_publish_ck CHECK (published_at IS NULL OR published_by IS NOT NULL),
    CONSTRAINT assignments_title_ck CHECK (char_length(title) BETWEEN 2 AND 200)
);

CREATE INDEX IF NOT EXISTS assignments_institution_id_idx
    ON public.assignments (institution_id);
CREATE INDEX IF NOT EXISTS assignments_section_id_idx
    ON public.assignments (section_id);
CREATE INDEX IF NOT EXISTS assignments_subject_id_idx
    ON public.assignments (subject_id);
CREATE INDEX IF NOT EXISTS assignments_academic_year_id_idx
    ON public.assignments (academic_year_id);
CREATE INDEX IF NOT EXISTS assignments_semester_id_idx
    ON public.assignments (semester_id);
CREATE INDEX IF NOT EXISTS assignments_department_id_idx
    ON public.assignments (department_id);
CREATE INDEX IF NOT EXISTS assignments_program_id_idx
    ON public.assignments (program_id);
CREATE INDEX IF NOT EXISTS assignments_owner_id_idx
    ON public.assignments (owner_id);
CREATE INDEX IF NOT EXISTS assignments_status_idx
    ON public.assignments (status);
CREATE INDEX IF NOT EXISTS assignments_due_at_idx
    ON public.assignments (due_at);

-- ============================================================
-- assignment_submissions — history-preserving attempts
-- One row per attempt; never hard-deleted.
-- Students never see other students' rows (application-level).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id uuid NOT NULL REFERENCES public.assignments (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    section_id uuid NOT NULL REFERENCES public.sections (id),
    subject_id uuid NOT NULL REFERENCES public.subjects (id),
    student_id uuid NOT NULL REFERENCES public.profiles (id),

    attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),

    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted', 'returned', 'graded')),

    content_text text NOT NULL DEFAULT '',
    content_note text NOT NULL DEFAULT '',

    submitted_at timestamptz,
    returned_at timestamptz,

    -- faculty review / feedback (foundation; no AI)
    score integer CHECK (score IS NULL OR score >= 0),
    max_points_snapshot integer CHECK (max_points_snapshot IS NULL OR max_points_snapshot >= 0),
    feedback text NOT NULL DEFAULT '',
    reviewed_by uuid REFERENCES public.profiles (id),
    reviewed_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT assignment_submissions_submit_ck CHECK (submitted_at IS NULL OR status <> 'draft'),
    CONSTRAINT assignment_submissions_review_ck CHECK (reviewed_at IS NULL OR reviewed_by IS NOT NULL),
    CONSTRAINT assignment_submissions_grade_ck CHECK (
        (status = 'graded' AND score IS NOT NULL AND reviewed_at IS NOT NULL)
        OR status <> 'graded'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS assignment_submissions_attempt_idx
    ON public.assignment_submissions (assignment_id, student_id, attempt_number);
CREATE INDEX IF NOT EXISTS assignment_submissions_assignment_id_idx
    ON public.assignment_submissions (assignment_id);
CREATE INDEX IF NOT EXISTS assignment_submissions_student_id_idx
    ON public.assignment_submissions (student_id);
CREATE INDEX IF NOT EXISTS assignment_submissions_institution_id_idx
    ON public.assignment_submissions (institution_id);
CREATE INDEX IF NOT EXISTS assignment_submissions_section_id_idx
    ON public.assignment_submissions (section_id);
CREATE INDEX IF NOT EXISTS assignment_submissions_status_idx
    ON public.assignment_submissions (status);

-- ============================================================
-- question_bank_items — reusable question bank (subject-scoped)
-- approval foundation: draft → approved → retired
-- ============================================================
CREATE TABLE IF NOT EXISTS public.question_bank_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    department_id uuid NOT NULL REFERENCES public.departments (id),
    program_id uuid NOT NULL REFERENCES public.programs (id),
    academic_year_id uuid REFERENCES public.academic_years (id),
    subject_id uuid NOT NULL REFERENCES public.subjects (id),

    owner_id uuid NOT NULL REFERENCES public.profiles (id),
    created_by uuid NOT NULL REFERENCES public.profiles (id),

    question_type text NOT NULL DEFAULT 'short'
        CHECK (question_type IN ('mcq', 'short', 'long', 'numerical', 'true_false')),

    question_text text NOT NULL,
    options jsonb NOT NULL DEFAULT '[]'::jsonb,
    answer_key text NOT NULL DEFAULT '',
    explanation text NOT NULL DEFAULT '',

    marks integer NOT NULL DEFAULT 1 CHECK (marks >= 1),
    difficulty text NOT NULL DEFAULT 'medium'
        CHECK (difficulty IN ('easy', 'medium', 'hard')),
    unit_ref text,

    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'approved', 'retired')),

    approved_by uuid REFERENCES public.profiles (id),
    approved_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT question_bank_items_approval_ck CHECK (approved_at IS NULL OR approved_by IS NOT NULL),
    CONSTRAINT question_bank_items_text_ck CHECK (char_length(question_text) BETWEEN 2 AND 5000)
);

CREATE INDEX IF NOT EXISTS question_bank_items_institution_id_idx
    ON public.question_bank_items (institution_id);
CREATE INDEX IF NOT EXISTS question_bank_items_subject_id_idx
    ON public.question_bank_items (subject_id);
CREATE INDEX IF NOT EXISTS question_bank_items_department_id_idx
    ON public.question_bank_items (department_id);
CREATE INDEX IF NOT EXISTS question_bank_items_owner_id_idx
    ON public.question_bank_items (owner_id);
CREATE INDEX IF NOT EXISTS question_bank_items_status_idx
    ON public.question_bank_items (status);
CREATE INDEX IF NOT EXISTS question_bank_items_academic_year_id_idx
    ON public.question_bank_items (academic_year_id);

-- ============================================================
-- question_papers — exam/assignment paper with review/approval lifecycle
-- ============================================================
CREATE TABLE IF NOT EXISTS public.question_papers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    university_id uuid NOT NULL REFERENCES public.universities (id),
    department_id uuid NOT NULL REFERENCES public.departments (id),
    program_id uuid NOT NULL REFERENCES public.programs (id),
    academic_year_id uuid NOT NULL REFERENCES public.academic_years (id),
    semester_id uuid NOT NULL REFERENCES public.semesters (id),
    section_id uuid REFERENCES public.sections (id),
    subject_id uuid NOT NULL REFERENCES public.subjects (id),

    owner_id uuid NOT NULL REFERENCES public.profiles (id),
    created_by uuid NOT NULL REFERENCES public.profiles (id),

    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    paper_kind text NOT NULL DEFAULT 'assignment'
        CHECK (paper_kind IN ('assignment', 'quiz', 'mst', 'final', 'practice')),

    total_marks integer NOT NULL DEFAULT 0 CHECK (total_marks >= 0),
    duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),

    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'in_review', 'approved', 'published', 'archived')),

    submitted_by uuid REFERENCES public.profiles (id),
    submitted_at timestamptz,
    approved_by uuid REFERENCES public.profiles (id),
    approved_at timestamptz,
    approval_note text,
    published_by uuid REFERENCES public.profiles (id),
    published_at timestamptz,

    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT question_papers_title_ck CHECK (char_length(title) BETWEEN 2 AND 200),
    CONSTRAINT question_papers_approve_ck CHECK (approved_at IS NULL OR approved_by IS NOT NULL),
    CONSTRAINT question_papers_publish_ck CHECK (published_at IS NULL OR published_by IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS question_papers_institution_id_idx
    ON public.question_papers (institution_id);
CREATE INDEX IF NOT EXISTS question_papers_section_id_idx
    ON public.question_papers (section_id);
CREATE INDEX IF NOT EXISTS question_papers_subject_id_idx
    ON public.question_papers (subject_id);
CREATE INDEX IF NOT EXISTS question_papers_academic_year_id_idx
    ON public.question_papers (academic_year_id);
CREATE INDEX IF NOT EXISTS question_papers_department_id_idx
    ON public.question_papers (department_id);
CREATE INDEX IF NOT EXISTS question_papers_owner_id_idx
    ON public.question_papers (owner_id);
CREATE INDEX IF NOT EXISTS question_papers_status_idx
    ON public.question_papers (status);

-- ============================================================
-- question_paper_items — ordered questions on a paper
-- question_text is snapshotted from bank (or free text for ad-hoc).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.question_paper_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id uuid NOT NULL REFERENCES public.question_papers (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    question_bank_item_id uuid REFERENCES public.question_bank_items (id),
    order_number integer NOT NULL CHECK (order_number >= 1),
    question_text_snapshot text NOT NULL,
    marks integer NOT NULL DEFAULT 1 CHECK (marks >= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS question_paper_items_paper_order_idx
    ON public.question_paper_items (paper_id, order_number);
CREATE INDEX IF NOT EXISTS question_paper_items_paper_id_idx
    ON public.question_paper_items (paper_id);
CREATE INDEX IF NOT EXISTS question_paper_items_bank_item_id_idx
    ON public.question_paper_items (question_bank_item_id);

-- ============================================================
-- mid_semester_tests — MST-1 and MST-2 records
-- Lifecycle + review/approval foundation; optional linked question paper.
-- One MST-N per section+subject+academic_year (partial unique).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mid_semester_tests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    university_id uuid NOT NULL REFERENCES public.universities (id),
    department_id uuid NOT NULL REFERENCES public.departments (id),
    program_id uuid NOT NULL REFERENCES public.programs (id),
    academic_year_id uuid NOT NULL REFERENCES public.academic_years (id),
    semester_id uuid NOT NULL REFERENCES public.semesters (id),
    section_id uuid NOT NULL REFERENCES public.sections (id),
    subject_id uuid NOT NULL REFERENCES public.subjects (id),

    mst_number integer NOT NULL CHECK (mst_number IN (1, 2)),

    owner_id uuid NOT NULL REFERENCES public.profiles (id),
    created_by uuid NOT NULL REFERENCES public.profiles (id),

    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    scheduled_on date,
    max_marks integer NOT NULL DEFAULT 40 CHECK (max_marks > 0),
    question_paper_id uuid REFERENCES public.question_papers (id),

    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'in_review', 'approved', 'published', 'archived')),

    submitted_by uuid REFERENCES public.profiles (id),
    submitted_at timestamptz,
    approved_by uuid REFERENCES public.profiles (id),
    approved_at timestamptz,
    approval_note text,
    published_by uuid REFERENCES public.profiles (id),
    published_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mid_semester_tests_title_ck CHECK (char_length(title) BETWEEN 2 AND 200),
    CONSTRAINT mid_semester_tests_approve_ck CHECK (approved_at IS NULL OR approved_by IS NOT NULL),
    CONSTRAINT mid_semester_tests_publish_ck CHECK (published_at IS NULL OR published_by IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS mid_semester_tests_scope_number_idx
    ON public.mid_semester_tests (section_id, subject_id, academic_year_id, mst_number);
CREATE INDEX IF NOT EXISTS mid_semester_tests_institution_id_idx
    ON public.mid_semester_tests (institution_id);
CREATE INDEX IF NOT EXISTS mid_semester_tests_section_id_idx
    ON public.mid_semester_tests (section_id);
CREATE INDEX IF NOT EXISTS mid_semester_tests_subject_id_idx
    ON public.mid_semester_tests (subject_id);
CREATE INDEX IF NOT EXISTS mid_semester_tests_academic_year_id_idx
    ON public.mid_semester_tests (academic_year_id);
CREATE INDEX IF NOT EXISTS mid_semester_tests_department_id_idx
    ON public.mid_semester_tests (department_id);
CREATE INDEX IF NOT EXISTS mid_semester_tests_owner_id_idx
    ON public.mid_semester_tests (owner_id);
CREATE INDEX IF NOT EXISTS mid_semester_tests_status_idx
    ON public.mid_semester_tests (status);
CREATE INDEX IF NOT EXISTS mid_semester_tests_mst_number_idx
    ON public.mid_semester_tests (mst_number);

-- ============================================================
-- updated_at triggers
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
END $$;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'assignments',
        'assignment_submissions',
        'question_bank_items',
        'question_papers',
        'question_paper_items',
        'mid_semester_tests'
    ] LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I',
            t, t
        );
        EXECUTE format(
            'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
            t, t
        );
    END LOOP;
END $$;

INSERT INTO public.schema_migrations (name)
VALUES ('006_academic_assessment')
ON CONFLICT (name) DO NOTHING;

COMMIT;
