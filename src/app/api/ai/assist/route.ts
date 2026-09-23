import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { AiValidationError, AiProviderError } from "@/lib/ai/types";
import { runAiAssistance, type AiAssistInput } from "@/lib/ai-service";

/**
 * POST /api/ai/assist — role-aware AI assistance.
 * 401 unauthenticated · 403 role/feature/context denied · 400 validation ·
 * 502/503 provider issues (safe messages only, never raw provider errors).
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "VALIDATION", message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const raw = (body ?? {}) as Record<string, unknown>;
    const contextRaw = (raw.context ?? {}) as Record<string, unknown> | null;

    const input: AiAssistInput = {
      feature: typeof raw.feature === "string" ? raw.feature : "",
      prompt: typeof raw.prompt === "string" ? raw.prompt : "",
      context:
        contextRaw && typeof contextRaw === "object"
          ? {
              kind:
                typeof contextRaw.kind === "string" ? contextRaw.kind : undefined,
              id: typeof contextRaw.id === "string" ? contextRaw.id : undefined,
            }
          : undefined,
    };

    const result = await runAiAssistance(ctx, input);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AiValidationError) {
      return NextResponse.json(
        { error: "VALIDATION", message: error.message },
        { status: 400 }
      );
    }
    if (error instanceof AuthzError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }
    if (error instanceof AiProviderError) {
      const status =
        error.code === "rate_limit"
          ? 429
          : error.code === "timeout"
            ? 504
            : error.code === "not_configured"
              ? 503
              : 502;
      return NextResponse.json(
        { error: "ai_unavailable", code: error.code, message: error.message },
        { status }
      );
    }
    return NextResponse.json(
      {
        error: "server_error",
        message: "Something went wrong. Please try again.",
      },
      { status: 500 }
    );
  }
}
