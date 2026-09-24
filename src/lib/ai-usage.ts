import { pool } from "@/lib/db";
import type { AuthContext } from "@/lib/authz";
import type { AiFeature } from "@/lib/ai/types";

/**
 * AI usage / audit metadata (Milestone 10).
 * Stores who/when/which feature/provider/status/tokens — never prompt or
 * response content. Users can only read their own usage history.
 */

export type AiUsageStatus = "ok" | "error" | "denied" | "timeout" | "rate_limited";

export type AiUsageInput = {
  institutionId: string | null;
  userId: string;
  roleName: string;
  feature: AiFeature;
  contextKind?: string | null;
  contextId?: string | null;
  provider: string;
  model?: string | null;
  status: AiUsageStatus;
  errorCode?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  durationMs?: number | null;
};

export type AiUsageRow = {
  id: string;
  feature: string;
  context_kind: string | null;
  context_id: string | null;
  provider: string;
  model: string | null;
  status: string;
  error_code: string | null;
  total_tokens: number | null;
  duration_ms: number | null;
  created_at: Date;
};

/** Insert usage metadata. Failures must never break the AI response path. */
export async function recordAiUsage(input: AiUsageInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO public.ai_usage_logs (
          institution_id, user_id, role_name, feature,
          context_kind, context_id, provider, model,
          status, error_code, prompt_tokens, completion_tokens,
          total_tokens, duration_ms
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        input.institutionId,
        input.userId,
        input.roleName,
        input.feature,
        input.contextKind ?? null,
        input.contextId ?? null,
        input.provider,
        input.model ?? null,
        input.status,
        input.errorCode ?? null,
        input.promptTokens ?? null,
        input.completionTokens ?? null,
        input.totalTokens ?? null,
        input.durationMs ?? null,
      ]
    );
  } catch {
    // Usage tracking is best-effort — never surface DB errors to the user.
  }
}

/** Own usage history only (never another user's AI history). */
export async function listOwnAiUsage(
  ctx: AuthContext,
  limit = 20
): Promise<AiUsageRow[]> {
  const capped = Math.min(Math.max(limit, 1), 50);
  const result = await pool.query<AiUsageRow>(
    `SELECT id, feature, context_kind, context_id, provider, model,
            status, error_code, total_tokens, duration_ms, created_at
       FROM public.ai_usage_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [ctx.userId, capped]
  );
  return result.rows;
}
