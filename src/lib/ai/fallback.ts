import type {
  AiProvider,
  AiProviderRequest,
  AiProviderResult,
} from "./types";

/**
 * Offline / unconfigured provider (Milestone 10).
 * Used when no AI provider credentials are present in the environment.
 * Returns a deterministic, clearly-labelled local guidance draft so the
 * workspace remains usable without inventing credentials or weakening auth.
 * Never contacts the network. Never stores prompt content.
 */

function extractUserPrompt(request: AiProviderRequest): string {
  const user = [...request.messages]
    .reverse()
    .find((m) => m.role === "user");
  return (user?.content ?? "").trim().slice(0, 400);
}

function firstLine(text: string): string {
  return text.split(/\r?\n/)[0].replace(/^["'\s]+|["'\s]+$/g, "");
}

export const fallbackProvider: AiProvider = {
  kind: "mock",
  name: "campus-skill-local",
  model: "local-guidance-v1",
  async complete(request: AiProviderRequest): Promise<AiProviderResult> {
    const prompt = extractUserPrompt(request);
    const topic = firstLine(prompt) || "this request";

    const text = [
      "Local guidance draft (no AI provider configured).",
      "",
      `Request focus: ${topic}`,
      "",
      "This workspace is ready for a provider connection. Until an AI",
      "provider is configured server-side, Campus Skill returns this",
      "structured study/teaching scaffold instead of a model response.",
      "",
      "Suggested approach:",
      "1. Restate the key idea in your own words.",
      "2. Break it into definitions, steps, and an example.",
      "3. Check the authorized subject/resource/assignment context attached.",
      "4. Draft a short summary, then revise.",
      "",
      "Academic integrity: use this as study/teaching assistance and",
      "suggestions — not as a guaranteed answer, grade, or official decision.",
      "",
      "[Configure AI_PROVIDER + AI_API_KEY server-side to enable live model responses.]",
    ].join("\n");

    return {
      text,
      model: this.model,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  },
};
