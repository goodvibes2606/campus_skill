import { AuthzError, type AuthContext } from "@/lib/authz";
import {
  AiValidationError,
  type AiChatMessage,
  type AiFeature,
} from "@/lib/ai/types";
import { getAiProvider, isRemoteAiConfigured, readAiProviderEnv } from "@/lib/ai/provider";
import { AiProviderError } from "@/lib/ai/types";
import {
  AI_FEATURES,
  isFeatureAllowed,
  canUseAi,
} from "@/lib/ai-features";
import {
  resolveAiContext,
  type AiContextRequest,
} from "@/lib/ai-context";
import { recordAiUsage } from "@/lib/ai-usage";
import type { SafeAiContext } from "@/lib/ai/types";

/**
 * Campus Skill AI service (Milestone 10).
 *
 * Flow (enforced here, not on the client):
 *   Authenticated user → role check → feature check → context ID
 *   re-authorization → safe context packet → system prompt → provider
 *   adapter → output handling → usage metadata → user.
 *
 * AI never receives unrestricted DB access. Client-supplied role,
 * institution, student, subject, or placement IDs are never trusted.
 * Prompts/outputs are not persisted — only usage metadata.
 */

const MAX_PROMPT = 4000;
const REQUEST_TIMEOUT_MS = 45_000;

export type AiAssistInput = {
  feature: string;
  prompt: string;
  context?: AiContextRequest;
};

export type AiAssistResult = {
  feature: AiFeature;
  featureLabel: string;
  response: string;
  context: SafeAiContext | null;
  provider: string;
  model: string;
  remoteConfigured: boolean;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  durationMs: number;
  disclaimer: string;
};

const DISCLAIMER =
  "AI provides explanation, draft, and study assistance only — not guaranteed answers, grades, or official decisions. Faculty judgment and institutional approval remain authoritative.";

function buildSystemPrompt(
  ctx: AuthContext,
  feature: AiFeature,
  context: SafeAiContext | null
): string {
  const lines: string[] = [
    "You are Campus Skill Assist, an institutional academic assistance layer inside the Campus Skill platform.",
    "You are NOT a generic consumer chatbot.",
    "",
    "Role of the user: " + ctx.roleName + ".",
    "Respond in clear, professional English with headings or short lists where helpful.",
    "",
    "Hard rules:",
    "- Assist learning and teaching: explanations, drafts, summaries, suggestions, revision support.",
    "- Never claim to guarantee answers, grades, plagiarism-free work, or AI-detection avoidance.",
    "- Never make or imply automatic institutional, grading, admissions, disciplinary, or placement decisions.",
    "- Never invent grades, attendance, private student records, or official approvals.",
    "- Stay inside the provided authorized context. If context is missing, say what is missing — do not invent facts about the institution.",
    "- For students: help them understand and practice; do not simply hand over a final submission.",
    "- For faculty/HOD/Director/TPO: produce drafts and decision-support information only; humans decide.",
    "- For system admin technical help: technical guidance only; do not request or discuss academic/confidential student data.",
    "",
    "Feature: " + AI_FEATURES[feature].label + " — " + AI_FEATURES[feature].detail,
  ];

  if (context) {
    lines.push(
      "",
      "Authorized context (server-validated, visibility-filtered):",
      `Kind: ${context.kind}`,
      `Label: ${context.label}`,
      `Summary: ${context.summary}`
    );
    if (context.details?.length) {
      lines.push("Details:");
      for (const d of context.details) lines.push(`- ${d}`);
    }
  } else {
    lines.push("", "No entity context attached — answer generally and ask a clarifying question if needed.");
  }

  return lines.join("\n");
}

/**
 * Run one authorized AI assistance request.
 * Throws AuthzError / AiValidationError / AiProviderError — caller maps them.
 */
export async function runAiAssistance(
  ctx: AuthContext,
  input: AiAssistInput
): Promise<AiAssistResult> {
  const started = Date.now();

  if (!canUseAi(ctx.roleName)) {
    await recordAiUsage({
      institutionId: ctx.institutionId,
      userId: ctx.userId,
      roleName: ctx.roleName,
      feature: "technical_help",
      provider: "none",
      status: "denied",
      errorCode: "role_denied",
      durationMs: Date.now() - started,
    });
    throw new AuthzError(
      "FORBIDDEN",
      "AI assistance is not available for your role"
    );
  }

  const feature = (input.feature || "").trim() as AiFeature;
  if (!isFeatureAllowed(ctx.roleName, feature)) {
    await recordAiUsage({
      institutionId: ctx.institutionId,
      userId: ctx.userId,
      roleName: ctx.roleName,
      feature: feature || "technical_help",
      provider: "none",
      status: "denied",
      errorCode: "feature_denied",
      durationMs: Date.now() - started,
    });
    throw new AuthzError(
      "FORBIDDEN",
      "That AI feature is not available for your role"
    );
  }

  const prompt = (input.prompt || "").trim();
  if (prompt.length < 2) {
    throw new AiValidationError("Please enter a question or request");
  }
  if (prompt.length > MAX_PROMPT) {
    throw new AiValidationError(
      `Request too long (max ${MAX_PROMPT} characters)`
    );
  }

  // Re-authorize any client-provided context ID server-side.
  const context = await resolveAiContext(ctx, input.context ?? {});

  const system = buildSystemPrompt(ctx, feature, context);
  const messages: AiChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ];

  const provider = getAiProvider();
  const remote = isRemoteAiConfigured(readAiProviderEnv());

  try {
    const result = await provider.complete({
      messages,
      maxTokens: 1200,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    const durationMs = Date.now() - started;
    await recordAiUsage({
      institutionId: ctx.institutionId,
      userId: ctx.userId,
      roleName: ctx.roleName,
      feature,
      contextKind: context?.kind ?? null,
      contextId: input.context?.id ?? null,
      provider: provider.name,
      model: result.model,
      status: "ok",
      promptTokens: result.usage?.promptTokens ?? null,
      completionTokens: result.usage?.completionTokens ?? null,
      totalTokens: result.usage?.totalTokens ?? null,
      durationMs,
    });

    return {
      feature,
      featureLabel: AI_FEATURES[feature].label,
      response: result.text,
      context,
      provider: provider.name,
      model: result.model,
      remoteConfigured: remote,
      usage: result.usage,
      durationMs,
      disclaimer: DISCLAIMER,
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    const providerError =
      error instanceof AiProviderError
        ? error
        : new AiProviderError("unavailable", "AI request failed");

    await recordAiUsage({
      institutionId: ctx.institutionId,
      userId: ctx.userId,
      roleName: ctx.roleName,
      feature,
      contextKind: context?.kind ?? null,
      contextId: input.context?.id ?? null,
      provider: provider.name,
      model: provider.model,
      status:
        providerError.code === "timeout"
          ? "timeout"
          : providerError.code === "rate_limit"
            ? "rate_limited"
            : "error",
      errorCode: providerError.code,
      durationMs,
    });

    // Never expose raw provider errors — map to a recovery message.
    throw new AiProviderError(providerError.code, recoveryMessage(providerError.code));
  }
}

function recoveryMessage(code: AiProviderError["code"]): string {
  switch (code) {
    case "not_configured":
      return "AI provider is not configured yet. Try the local guidance draft or contact your administrator.";
    case "timeout":
      return "The AI request timed out. Please try again in a moment.";
    case "rate_limit":
      return "Too many AI requests right now. Wait a moment and try again.";
    case "invalid_response":
    case "empty_response":
      return "The AI returned an unusable response. Please rephrase and try again.";
    case "unavailable":
    default:
      return "AI service is temporarily unavailable. Please try again shortly.";
  }
}
