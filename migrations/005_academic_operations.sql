-- Milestone 5 — Academic Operations
-- Syllabus + versions + units + topics, academic calendar + approval,
-- daily work reporting, core notifications (+ channel deliveries independent).
-- Additive and non-destructive. Reuses M1–M4 hierarchy.
-- Safe to re-run: DDL is IF NOT EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- syllabi — subject + academic year syllabus with lifecycle
-- subject_code read via subjects.subject_code (not duplicated).
-- source_* records provenance only — no official university content invented.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.syllabi (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    department_id uuid NOT NULL REFERENCES public.departments (id),
    program_id uuid NOT NULL REFERENCES public.programs (id),
    academic_year_id uuid NOT NULL REFERENCES public.academic_years (id),
    subject_id uuid NOT NULL REFERENCES public.subjects (id),

    title text NOT NULL,
    description text NOT NULL DEFAULT '',

    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),

    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft', 'in_review', 'approved', 'published', 'archived'
        )),

    -- source information (provenance metadata only)
    source_type text NOT NULL DEFAULT 'faculty_prepared'
        CHECK (source_type IN (
            'faculty_prepared', 'institution_supplied', 'imported', 'unverified'
        )),
    source_reference text,
    source_notes text,
    source_is_official boolean NOT NULL DEFAULT false,

    created_by uuid NOT NULL REFERENCES public.profiles (id),
    submitted_by uuid REFERENCES public.profiles (id),
    submitted_at timestamptz,
    approved_by uuid REFERENCES public.profiles (id),
    approved_at timestamptz,
    approval_note text,
    published_by uuid REFERENCES public.profiles (id),
    published_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT syllabi_approval_ck CHECK (approved_at IS NULL OR approved_by IS NOT NULL),
    CONSTRAINT syllabi_publish_ck CHECK (published_at IS NULL OR published_by IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS syllabi_subject_year_version_idx
    ON public.syllabi (subject_id, academic_year_id, version);
CREATE INDEX IF NOT EXISTS syllabi_institution_id_idx
    ON public.syllabi (institution_id);
CREATE INDEX IF NOT EXISTS syllabi_subject_id_idx
    ON public.syllabi (subject_id);
CREATE INDEX IF NOT EXISTS syllabi_academic_year_id_idx
    ON public.syllabi (academic_year_id);
CREATE INDEX IF NOT EXISTS syllabi_department_id_idx
    ON public.syllabi (department_id);
CREATE INDEX IF NOT EXISTS syllabi_program_id_idx
    ON public.syllabi (program_id);
CREATE INDEX IF NOT EXISTS syllabi_status_idx
    ON public.syllabi (status);
CREATE INDEX IF NOT EXISTS syllabi_created_by_idx
    ON public.syllabi (created_by);

-- At most one non-archived syllabus row per subject+year+version already unique;
-- allow only one published syllabus per subject+year (partial unique)
CREATE UNIQUE INDEX IF NOT EXISTS syllabi_published_idx
    ON public.syllabi (subject_id, academic_year_id)
    WHERE status = 'published';

-- ============================================================
-- syllabus_versions — immutable history snapshots of syllabus state
-- ============================================================
CREATE TABLE IF NOT EXISTS public.syllabus_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    syllabus_id uuid NOT NULL REFERENCES public.syllabi (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    version integer NOT NULL CHECK (version >= 1),
    status text NOT NULL
        CHECK (status IN (
            'draft', 'in_review', 'approved', 'published', 'archived'
        )),
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    source_type text NOT NULL,
    source_reference text,
    source_notes text,
    source_is_official boolean NOT NULL DEFAULT false,
    change_note text,
    snapshot_by uuid NOT NULL REFERENCES public.profiles (id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS syllabus_versions_syllabus_version_idx
    ON public.syllabus_versions (syllabus_id, version);
CREATE INDEX IF NOT EXISTS syllabus_versions_institution_id_idx
    ON public.syllabus_versions (institution_id);

-- ============================================================
-- syllabus_units — ordered units under a syllabus
-- ============================================================
CREATE TABLE IF NOT EXISTS public.syllabus_units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    syllabus_id uuid NOT NULL REFERENCES public.syllabi (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    unit_number integer NOT NULL CHECK (unit_number >= 1),
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS syllabus_units_syllabus_unit_number_idx
    ON public.syllabus_units (syllabus_id, unit_number);
CREATE INDEX IF NOT EXISTS syllabus_units_syllabus_id_idx
    ON public.syllabus_units (syllabus_id);
CREATE INDEX IF NOT EXISTS syllabus_units_institution_id_idx
    ON public.syllabus_units (institution_id);

-- ============================================================
-- syllabus_topics — ordered topics under a unit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.syllabus_topics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id uuid NOT NULL REFERENCES public.syllabus_units (id),
    syllabus_id uuid NOT NULL REFERENCES public.syllabi (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    topic_number integer NOT NULL CHECK (topic_number >= 1),
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS syllabus_topics_unit_topic_number_idx
    ON public.syllabus_topics (unit_id, topic_number);
CREATE INDEX IF NOT EXISTS syllabus_topics_syllabus_id_idx
    ON public.syllabus_topics (syllabus_id);
CREATE INDEX IF NOT EXISTS syllabus_topics_unit_id_idx
    ON public.syllabus_topics (unit_id);
CREATE INDEX IF NOT EXISTS syllabus_topics_institution_id_idx
    ON public.syllabus_topics (institution_id);

-- ============================================================
-- academic_calendar_events — institutional dates + approval state
-- department_id NULL = institution-wide date.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.academic_calendar_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    department_id uuid REFERENCES public.departments (id),
    academic_year_id uuid REFERENCES public.academic_years (id),

    title text NOT NULL,
    description text NOT NULL DEFAULT '',

    event_type text NOT NULL DEFAULT 'event'
        CHECK (event_type IN (
            'event', 'holiday', 'exam', 'deadline',
            'class_start', 'class_end', 'meeting', 'other'
        )),

    starts_on date NOT NULL,
    ends_on date NOT NULL,

    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft', 'pending_approval', 'approved',
            'rejected', 'published', 'archived'
        )),

    created_by uuid NOT NULL REFERENCES public.profiles (id),
    submitted_by uuid REFERENCES public.profiles (id),
    submitted_at timestamptz,
    approved_by uuid REFERENCES public.profiles (id),
    approved_at timestamptz,
    rejected_by uuid REFERENCES public.profiles (id),
    rejected_at timestamptz,
    approval_note text,

    -- circulation foundation (set when published after approval)
    circulated_by uuid REFERENCES public.profiles (id),
    circulated_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT academic_calendar_dates_ck CHECK (ends_on >= starts_on),
    CONSTRAINT academic_calendar_approve_ck CHECK (approved_at IS NULL OR approved_by IS NOT NULL),
    CONSTRAINT academic_calendar_reject_ck CHECK (rejected_at IS NULL OR rejected_by IS NOT NULL),
    CONSTRAINT academic_calendar_circulate_ck CHECK (circulated_at IS NULL OR circulated_by IS NOT NULL),
    CONSTRAINT academic_calendar_approval_exclusive_ck CHECK (
        NOT (approved_at IS NOT NULL AND rejected_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS academic_calendar_events_institution_id_idx
    ON public.academic_calendar_events (institution_id);
CREATE INDEX IF NOT EXISTS academic_calendar_events_starts_on_idx
    ON public.academic_calendar_events (starts_on);
CREATE INDEX IF NOT EXISTS academic_calendar_events_status_idx
    ON public.academic_calendar_events (status);
CREATE INDEX IF NOT EXISTS academic_calendar_events_department_id_idx
    ON public.academic_calendar_events (department_id);
CREATE INDEX IF NOT EXISTS academic_calendar_events_academic_year_id_idx
    ON public.academic_calendar_events (academic_year_id);

-- ============================================================
-- daily_work_reports — faculty/HOD daily work reporting
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_work_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    department_id uuid REFERENCES public.departments (id),
    reporter_id uuid NOT NULL REFERENCES public.profiles (id),
    report_date date NOT NULL,
    summary text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted', 'acknowledged', 'returned')),
    acknowledged_by uuid REFERENCES public.profiles (id),
    acknowledged_at timestamptz,
    return_note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT daily_work_ack_ck CHECK (acknowledged_at IS NULL OR acknowledged_by IS NOT NULL)
);

-- One report per reporter per day
CREATE UNIQUE INDEX IF NOT EXISTS daily_work_reports_reporter_date_idx
    ON public.daily_work_reports (reporter_id, report_date);
CREATE INDEX IF NOT EXISTS daily_work_reports_institution_id_idx
    ON public.daily_work_reports (institution_id);
CREATE INDEX IF NOT EXISTS daily_work_reports_reporter_id_idx
    ON public.daily_work_reports (reporter_id);
CREATE INDEX IF NOT EXISTS daily_work_reports_report_date_idx
    ON public.daily_work_reports (report_date);
CREATE INDEX IF NOT EXISTS daily_work_reports_department_id_idx
    ON public.daily_work_reports (department_id);
CREATE INDEX IF NOT EXISTS daily_work_reports_status_idx
    ON public.daily_work_reports (status);

-- ============================================================
-- daily_work_items — line items under a daily work report
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_work_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id uuid NOT NULL REFERENCES public.daily_work_reports (id),
    institution_id uuid NOT NULL REFERENCES public.institutions (id),
    work_type text NOT NULL DEFAULT 'other'
        CHECK (work_type IN (
            'lecture', 'lab', 'tutorial', 'exam_duty',
            'meeting', 'mentoring', 'other'
        )),
    subject_id uuid REFERENCES public.subjects (id),
    section_id uuid REFERENCES public.sections (id),
    description text NOT NULL,
    duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_work_items_report_id_idx
    ON public.daily_work_items (report_id);
CREATE INDEX IF NOT EXISTS daily_work_items_institution_id_idx
    ON public.daily_work_items (institution_id);

-- ============================================================
-- notifications — core reusable model (no channels here)
-- event / recipient / read-unread / priority / timestamp
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid REFERENCES public.institutions (id),
    recipient_id uuid NOT NULL REFERENCES public.profiles (id),
    event text NOT NULL,
    title text NOT NULL,
    body text NOT NULL DEFAULT '',
    priority text NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_id_idx
    ON public.notifications (recipient_id);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
    ON public.notifications (recipient_id)
    WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_institution_id_idx
    ON public.notifications (institution_id);
CREATE INDEX IF NOT EXISTS notifications_event_idx
    ON public.notifications (event);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx
    ON public.notifications (created_at DESC);

-- ============================================================
-- notification_channel_deliveries — channels kept OFF the core model
-- Channel keys are open (in_app, email, sms, push, webhook, …).
-- Application code must not hard-code a specific messaging vendor.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_channel_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id uuid NOT NULL REFERENCES public.notifications (id),
    institution_id uuid REFERENCES public.institutions (id),
    channel text NOT NULL CHECK (char_length(channel) BETWEEN 1 AND 40),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    external_ref text,
    error_message text,
    attempted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_channel_deliveries_notification_id_idx
    ON public.notification_channel_deliveries (notification_id);
CREATE INDEX IF NOT EXISTS notification_channel_deliveries_status_idx
    ON public.notification_channel_deliveries (status);
CREATE INDEX IF NOT EXISTS notification_channel_deliveries_channel_idx
    ON public.notification_channel_deliveries (channel);

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
        'syllabi',
        'syllabus_units',
        'syllabus_topics',
        'academic_calendar_events',
        'daily_work_reports',
        'daily_work_items',
        'notifications',
        'notification_channel_deliveries'
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
VALUES ('005_academic_operations')
ON CONFLICT (name) DO NOTHING;

COMMIT;
