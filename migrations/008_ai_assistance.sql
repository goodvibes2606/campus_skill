-- Milestone 10 — AI Assistance Foundation
-- ADDITIVE and non-destructive. Reuses M1–M9 identity, academic, placement.
-- Safe to re-run: DDL is IF NOT EXISTS.
-- Does NOT introduce Supabase, does not touch auth.* or environment secrets.
-- Privacy: usage metadata only — prompts/outputs are NOT stored here.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ai_usage_logs — AI usage / audit foundation (metadata only)
-- Tracks who used which AI feature, when, with which provider/model
-- and request outcome. No prompt or response content is persisted.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid REFERENCES public.institutions (id),
    user_id uuid NOT NULL REFERENCES public.profiles (id),
    role_name text NOT NULL,

    feature text NOT NULL,
    context_kind text,
    context_id uuid,

    provider text NOT NULL DEFAULT 'none',
    model text,

    status text NOT NULL DEFAULT 'ok'
        CHECK (status IN ('ok', 'error', 'denied', 'timeout', 'rate_limited')),
    error_code text,

    prompt_tokens integer,
    completion_tokens integer,
    total_tokens integer,
    duration_ms integer,

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_user_id_created_at_idx
    ON public.ai_usage_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_logs_institution_id_created_at_idx
    ON public.ai_usage_logs (institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_logs_created_at_idx
    ON public.ai_usage_logs (created_at DESC);

INSERT INTO public.schema_migrations (name)
VALUES ('008_ai_assistance') ON CONFLICT (name) DO NOTHING;

COMMIT;
