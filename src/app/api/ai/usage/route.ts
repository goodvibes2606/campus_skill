import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { canUseAi } from "@/lib/ai-features";
import { listOwnAiUsage } from "@/lib/ai-usage";

/**
 * GET /api/ai/usage — caller's own AI usage metadata (never others').
 * Metadata only: no prompt/response content is returned or stored.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    if (!canUseAi(ctx.roleName)) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "AI assistance is not available for your role" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "20");
    const rows = await listOwnAiUsage(
      ctx,
      Number.isFinite(limit) ? limit : 20
    );

    return NextResponse.json({
      count: rows.length,
      usage: rows.map((r) => ({
        id: r.id,
        feature: r.feature,
        contextKind: r.context_kind,
        provider: r.provider,
        model: r.model,
        status: r.status,
        errorCode: r.error_code,
        totalTokens: r.total_tokens,
        durationMs: r.duration_ms,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }
    return NextResponse.json(
      { error: "server_error", message: "Could not load AI usage" },
      { status: 500 }
    );
  }
}
