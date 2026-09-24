import { fallbackProvider } from "./fallback";
import { createOpenAiCompatibleProvider } from "./openai-compatible";
import type { AiProvider } from "./types";

/**
 * AI provider registry (Milestone 10).
 *
 * Reads server-side environment only:
 *   AI_PROVIDER            — "openai" | "openai_compatible" | "" (default off)
 *   AI_API_KEY             — secret; never exposed to the browser
 *   AI_BASE_URL            — OpenAI-compatible endpoint root (…/v1)
 *   AI_MODEL               — model id
 *
 * When unconfigured, returns the local fallback so the product reports the
 * limitation safely instead of inventing credentials or failing open.
 * Provider selection is NOT hard-coded throughout the app — only here.
 */

export type AiProviderEnv = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export function readAiProviderEnv(): AiProviderEnv {
  return {
    provider: (process.env.AI_PROVIDER ?? "").trim().toLowerCase(),
    apiKey: (process.env.AI_API_KEY ?? "").trim(),
    baseUrl: (process.env.AI_BASE_URL ?? "").trim(),
    model: (process.env.AI_MODEL ?? "").trim(),
  };
}

/** True only when a real remote provider is fully configured. */
export function isRemoteAiConfigured(env: AiProviderEnv = readAiProviderEnv()): boolean {
  if (!env.provider || env.provider === "none" || env.provider === "mock") {
    return false;
  }
  if (!env.apiKey) return false;
  if (env.provider === "openai" || env.provider === "openai_compatible") {
    return Boolean(env.baseUrl || env.provider === "openai");
  }
  return false;
}

/** Resolve the active provider adapter (server-side only). */
export function getAiProvider(): AiProvider {
  const env = readAiProviderEnv();

  if (
    (env.provider === "openai" || env.provider === "openai_compatible") &&
    env.apiKey
  ) {
    const baseUrl =
      env.baseUrl ||
      (env.provider === "openai" ? "https://api.openai.com/v1" : "");
    if (baseUrl) {
      return createOpenAiCompatibleProvider({
        baseUrl,
        apiKey: env.apiKey,
        model: env.model || "gpt-4o-mini",
      });
    }
  }

  // Unconfigured → safe local fallback (reports limitation; no fake secrets).
  return fallbackProvider;
}
