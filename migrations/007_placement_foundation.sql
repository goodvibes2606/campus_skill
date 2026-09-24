-- Milestone 9 — Placement & Career Foundation
-- ADDITIVE and non-destructive. Reuses M1–M8 hierarchy + notifications.
-- Safe to re-run: DDL is IF NOT EXISTS; role seed is ON CONFLICT DO NOTHING.
-- Does NOT introduce Supabase, does not touch auth.* or environment secrets.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RBAC role catalog — placement foundation roles (additive)
-- Existing: student, faculty, admin, hod, director_dean, system_admin.
-- tpo = Training & Placement Officer (operational placement owner).
-- recruiter = future external role CATALOG ENTRY ONLY (no portal, no
-- permissions granted by this migration).
-- ============================================================
INSERT INTO public.roles (name, description) VALUES
    ('tpo', 'Training and Placement Officer'),
    ('recruiter', 'External recruiter (future role — no portal in M9)')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- placement_responsibilities — TPO / assigned-faculty appointment history
-- History-preserving: a new appointment never overwrites the previous one.
-- status pending → (director approve) active → (end/handover) ended.
-- department_id NULL + program_id NULL = institution-wide scope.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.placement_responsibilities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    person_id uuid NOT NULL REFERENCES public.profiles (id),

    responsibility text NOT NULL
        CHECK (responsibility IN ('tpo', 'placement_faculty')),
    responsibility_title text NOT NULL DEFAULT '',

    -- optional scope (NULL = institution-wide for tpo / unscoped faculty)
    department_id uuid REFERENCES public.departments (id),
    program_id uuid REFERENCES public.programs (id),
    scope_notes text NOT NULL DEFAULT '',

    requested_by uuid REFERENCES public.profiles (id),
    appointed_by uuid REFERENCES public.profiles (id),
    approved_by uuid REFERENCES public.profiles (id),
    approved_at timestamptz,
    decision_note text,

    starts_on date,
    ends_on date,

    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'ended', 'rejected')),

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT placement_resp_window_ck
        CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
    CONSTRAINT placement_resp_approval_ck
        CHECK (approved_at IS NULL OR approved_by IS NOT NULL),
    CONSTRAINT placement_resp_active_dates_ck
        CHECK (status <> 'active' OR starts_on IS NOT NULL)
);

-- At most one active TPO per institution (handover closes the previous row)
CREATE UNIQUE INDEX IF NOT EXISTS placement_resp_tpo_active_idx
    ON public.placement_responsibilities (institution_id)
    WHERE responsibility = 'tpo' AND status = 'active';

-- One active placement-faculty responsibility per person per department scope
CREATE UNIQUE INDEX IF NOT EXISTS placement_resp_faculty_scope_active_idx
    ON public.placement_responsibilities (
        institution_id,
        person_id,
        COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE responsibility = 'placement_faculty' AND status = 'active';

CREATE INDEX IF NOT EXISTS placement_resp_institution_id_idx
    ON public.placement_responsibilities (institution_id);
CREATE INDEX IF NOT EXISTS placement_resp_person_id_idx
    ON public.placement_responsibilities (person_id);
CREATE INDEX IF NOT EXISTS placement_resp_status_idx
    ON public.placement_responsibilities (status);
CREATE INDEX IF NOT EXISTS placement_resp_responsibility_idx
    ON public.placement_responsibilities (responsibility);
CREATE INDEX IF NOT EXISTS placement_resp_department_id_idx
    ON public.placement_responsibilities (department_id);

-- ============================================================
-- companies — company foundation (institution-isolated)
-- Approval workflow: draft → pending_approval → approved | rejected.
-- Recruiter/contact stored as contact fields only (no recruiter portal).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.companies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),

    name text NOT NULL,
    website text,
    industry text,
    location text,

    contact_name text,
    contact_email text,
    contact_phone text,

    notes text NOT NULL DEFAULT '',

    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'archived')),

    created_by uuid NOT NULL REFERENCES public.profiles (id),
    submitted_by uuid REFERENCES public.profiles (id),
    submitted_at timestamptz,
    approved_by uuid REFERENCES public.profiles (id),
    approved_at timestamptz,
    rejected_by uuid REFERENCES public.profiles (id),
    rejected_at timestamptz,
    approval_note text,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT companies_name_ck CHECK (char_length(name) BETWEEN 2 AND 120),
    CONSTRAINT companies_approval_ck CHECK (approved_at IS NULL OR approved_by IS NOT NULL),
    CONSTRAINT companies_rejection_ck CHECK (rejected_at IS NULL OR rejected_by IS NOT NULL),
    CONSTRAINT companies_approval_exclusive_ck CHECK (
        NOT (approved_at IS NOT NULL AND rejected_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_inst_name_idx
    ON public.companies (institution_id, lower(name));
CREATE INDEX IF NOT EXISTS companies_institution_id_idx
    ON public.companies (institution_id);
CREATE INDEX IF NOT EXISTS companies_status_idx
    ON public.companies (status);
CREATE INDEX IF NOT EXISTS companies_created_by_idx
    ON public.companies (created_by);

-- ============================================================
-- placement_opportunities — jobs + internships foundation
-- Approval workflow: draft → pending_approval → approved | rejected
--                    → open → closed → archived.
-- compensation is free text foundation (salary/stipend) — no payroll engine.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.placement_opportunities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    company_id uuid NOT NULL REFERENCES public.companies (id),

    title text NOT NULL,
    description text NOT NULL DEFAULT '',

    opportunity_kind text NOT NULL DEFAULT 'job'
        CHECK (opportunity_kind IN ('job', 'internship')),
    employment_type text
        CHECK (employment_type IS NULL OR employment_type IN (
            'full_time', 'part_time', 'contract', 'temporary',
            'internship', 'apprenticeship'
        )),

    location text,
    compensation text,
    application_deadline date,
    interview_notes text NOT NULL DEFAULT '',

    department_id uuid REFERENCES public.departments (id),

    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft', 'pending_approval', 'approved', 'rejected',
            'open', 'closed', 'archived'
        )),

    created_by uuid NOT NULL REFERENCES public.profiles (id),
    managed_by uuid REFERENCES public.profiles (id),
    submitted_by uuid REFERENCES public.profiles (id),
    submitted_at timestamptz,
    approved_by uuid REFERENCES public.profiles (id),
    approved_at timestamptz,
    rejected_by uuid REFERENCES public.profiles (id),
    rejected_at timestamptz,
    approval_note text,
    opened_at timestamptz,
    closed_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT placement_opps_title_ck CHECK (char_length(title) BETWEEN 2 AND 160),
    CONSTRAINT placement_opps_deadline_ck CHECK (application_deadline IS NULL OR application_deadline >= created_at::date),
    CONSTRAINT placement_opps_approval_ck CHECK (approved_at IS NULL OR approved_by IS NOT NULL),
    CONSTRAINT placement_opps_rejection_ck CHECK (rejected_at IS NULL OR rejected_by IS NOT NULL),
    CONSTRAINT placement_opps_approval_exclusive_ck CHECK (
        NOT (approved_at IS NOT NULL AND rejected_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS placement_opps_institution_id_idx
    ON public.placement_opportunities (institution_id);
CREATE INDEX IF NOT EXISTS placement_opps_company_id_idx
    ON public.placement_opportunities (company_id);
CREATE INDEX IF NOT EXISTS placement_opps_status_idx
    ON public.placement_opportunities (status);
CREATE INDEX IF NOT EXISTS placement_opps_kind_idx
    ON public.placement_opportunities (opportunity_kind);
CREATE INDEX IF NOT EXISTS placement_opps_deadline_idx
    ON public.placement_opportunities (application_deadline);
CREATE INDEX IF NOT EXISTS placement_opps_created_by_idx
    ON public.placement_opportunities (created_by);
CREATE INDEX IF NOT EXISTS placement_opps_department_id_idx
    ON public.placement_opportunities (department_id);

-- ============================================================
-- placement_opportunity_eligibility — simple academic-scope eligibility
-- Semantics: each row = one allowed cohort. NO rows = open to every
-- student in the institution. NOT a rules engine (foundation only).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.placement_opportunity_eligibility (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id uuid NOT NULL
        REFERENCES public.placement_opportunities (id) ON DELETE CASCADE,
    institution_id uuid NOT NULL REFERENCES public.institutions (id),

    department_id uuid REFERENCES public.departments (id),
    program_id uuid REFERENCES public.programs (id),
    section_id uuid REFERENCES public.sections (id),
    semester_from integer CHECK (semester_from IS NULL OR semester_from >= 1),
    semester_to integer CHECK (semester_to IS NULL OR semester_to >= 1),

    notes text NOT NULL DEFAULT '',

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT placement_elig_semester_ck
        CHECK (semester_to IS NULL OR semester_from IS NULL OR semester_to >= semester_from)
);

CREATE INDEX IF NOT EXISTS placement_elig_opportunity_id_idx
    ON public.placement_opportunity_eligibility (opportunity_id);
CREATE INDEX IF NOT EXISTS placement_elig_institution_id_idx
    ON public.placement_opportunity_eligibility (institution_id);
CREATE INDEX IF NOT EXISTS placement_elig_program_id_idx
    ON public.placement_opportunity_eligibility (program_id);
CREATE INDEX IF NOT EXISTS placement_elig_section_id_idx
    ON public.placement_opportunity_eligibility (section_id);

-- ============================================================
-- placement_applications — application pipeline foundation
-- submitted → screening → shortlisted → interview → selected → offered
--           → joined | offer_declined ; plus rejected / withdrawn.
-- Students only ever see their own rows (application-level check).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.placement_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    opportunity_id uuid NOT NULL REFERENCES public.placement_opportunities (id),
    student_id uuid NOT NULL REFERENCES public.profiles (id),

    status text NOT NULL DEFAULT 'submitted'
        CHECK (status IN (
            'submitted', 'screening', 'shortlisted', 'interview',
            'selected', 'offered', 'joined', 'offer_declined',
            'rejected', 'withdrawn'
        )),

    cover_note text NOT NULL DEFAULT '',
    submitted_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    updated_by uuid REFERENCES public.profiles (id),

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS placement_apps_opp_student_idx
    ON public.placement_applications (opportunity_id, student_id);
CREATE INDEX IF NOT EXISTS placement_apps_institution_id_idx
    ON public.placement_applications (institution_id);
CREATE INDEX IF NOT EXISTS placement_apps_student_id_idx
    ON public.placement_applications (student_id);
CREATE INDEX IF NOT EXISTS placement_apps_opportunity_id_idx
    ON public.placement_applications (opportunity_id);
CREATE INDEX IF NOT EXISTS placement_apps_status_idx
    ON public.placement_applications (status);

-- ============================================================
-- placement_application_events — status history (never hard-deleted)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.placement_application_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL
        REFERENCES public.placement_applications (id) ON DELETE CASCADE,
    institution_id uuid NOT NULL REFERENCES public.institutions (id),

    from_status text,
    to_status text NOT NULL,
    actor_id uuid REFERENCES public.profiles (id),
    note text NOT NULL DEFAULT '',

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS placement_application_events_application_id_idx
    ON public.placement_application_events (application_id);
CREATE INDEX IF NOT EXISTS placement_application_events_institution_id_idx
    ON public.placement_application_events (institution_id);
CREATE INDEX IF NOT EXISTS placement_application_events_created_at_idx
    ON public.placement_application_events (created_at DESC);

-- ============================================================
-- placement_interviews — interview scheduling foundation
-- ============================================================
CREATE TABLE IF NOT EXISTS public.placement_interviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL
        REFERENCES public.placement_applications (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),

    scheduled_at timestamptz,
    mode text NOT NULL DEFAULT 'online'
        CHECK (mode IN ('online', 'in_person', 'phone', 'video')),
    location_or_link text,
    notes text NOT NULL DEFAULT '',

    status text NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
    outcome text
        CHECK (outcome IS NULL OR outcome IN ('selected', 'waitlisted', 'rejected')),

    created_by uuid NOT NULL REFERENCES public.profiles (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS placement_interviews_application_id_idx
    ON public.placement_interviews (application_id);
CREATE INDEX IF NOT EXISTS placement_interviews_institution_id_idx
    ON public.placement_interviews (institution_id);
CREATE INDEX IF NOT EXISTS placement_interviews_scheduled_at_idx
    ON public.placement_interviews (scheduled_at);
CREATE INDEX IF NOT EXISTS placement_interviews_status_idx
    ON public.placement_interviews (status);

-- ============================================================
-- placement_offers — offer / selection foundation
-- ============================================================
CREATE TABLE IF NOT EXISTS public.placement_offers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL
        REFERENCES public.placement_applications (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),

    offer_status text NOT NULL DEFAULT 'pending'
        CHECK (offer_status IN ('pending', 'accepted', 'declined', 'revoked')),
    offered_on date,
    joining_date date,
    compensation text,
    notes text NOT NULL DEFAULT '',

    created_by uuid NOT NULL REFERENCES public.profiles (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT placement_offers_dates_ck
        CHECK (joining_date IS NULL OR offered_on IS NULL OR joining_date >= offered_on)
);

CREATE INDEX IF NOT EXISTS placement_offers_application_id_idx
    ON public.placement_offers (application_id);
CREATE INDEX IF NOT EXISTS placement_offers_institution_id_idx
    ON public.placement_offers (institution_id);
CREATE INDEX IF NOT EXISTS placement_offers_status_idx
    ON public.placement_offers (offer_status);

-- ============================================================
-- placement_records — final placement record (one per application)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.placement_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    student_id uuid NOT NULL REFERENCES public.profiles (id),
    opportunity_id uuid NOT NULL REFERENCES public.placement_opportunities (id),
    company_id uuid NOT NULL REFERENCES public.companies (id),
    application_id uuid NOT NULL
        REFERENCES public.placement_applications (id),

    joined_on date,
    record_status text NOT NULL DEFAULT 'joined'
        CHECK (record_status IN ('joined', 'offer_declined', 'dropped')),
    compensation text,
    notes text NOT NULL DEFAULT '',

    recorded_by uuid NOT NULL REFERENCES public.profiles (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS placement_records_application_idx
    ON public.placement_records (application_id);
CREATE INDEX IF NOT EXISTS placement_records_institution_id_idx
    ON public.placement_records (institution_id);
CREATE INDEX IF NOT EXISTS placement_records_student_id_idx
    ON public.placement_records (student_id);
CREATE INDEX IF NOT EXISTS placement_records_company_id_idx
    ON public.placement_records (company_id);
CREATE INDEX IF NOT EXISTS placement_records_opportunity_id_idx
    ON public.placement_records (opportunity_id);
CREATE INDEX IF NOT EXISTS placement_records_status_idx
    ON public.placement_records (record_status);

-- ============================================================
-- student_career_profiles — student placement profile foundation
-- Academic identity comes from enrollment (not duplicated here).
-- No AI resume generation in M9.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_career_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.profiles (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),

    headline text NOT NULL DEFAULT '',
    summary text NOT NULL DEFAULT '',
    skills jsonb NOT NULL DEFAULT '[]'::jsonb,
    career_interests jsonb NOT NULL DEFAULT '[]'::jsonb,

    resume_reference text,
    readiness text NOT NULL DEFAULT 'not_started'
        CHECK (readiness IN ('not_started', 'in_progress', 'ready')),

    updated_by uuid REFERENCES public.profiles (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT career_profile_headline_ck
        CHECK (char_length(headline) <= 160),
    CONSTRAINT career_profile_summary_ck
        CHECK (char_length(summary) <= 4000),
    CONSTRAINT career_profile_skills_ck
        CHECK (jsonb_typeof(skills) = 'array'),
    CONSTRAINT career_profile_interests_ck
        CHECK (jsonb_typeof(career_interests) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS career_profiles_student_idx
    ON public.student_career_profiles (student_id);
CREATE INDEX IF NOT EXISTS career_profiles_institution_id_idx
    ON public.student_career_profiles (institution_id);
CREATE INDEX IF NOT EXISTS career_profiles_readiness_idx
    ON public.student_career_profiles (readiness);

-- ============================================================
-- updated_at triggers (idempotent) — reuse public.set_updated_at
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
        'placement_responsibilities',
        'companies',
        'placement_opportunities',
        'placement_opportunity_eligibility',
        'placement_applications',
        'placement_interviews',
        'placement_offers',
        'placement_records',
        'student_career_profiles'
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
VALUES ('007_placement_foundation')
ON CONFLICT (name) DO NOTHING;

COMMIT;
