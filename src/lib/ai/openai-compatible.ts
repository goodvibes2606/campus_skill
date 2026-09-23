import {
  AiProviderError,
  type AiProvider,
  type AiProviderRequest,
  type AiProviderResult,
} from "./types";

/**
 * OpenAI-compatible chat-completions adapter (Milestone 10).
 * Works with any endpoint that speaks the OpenAI chat API shape
 * (OpenAI, self-hosted, or a vendor's OpenAI-compatible gateway).
 *
 * Secrets: apiKey/baseUrl are read from server env only — never logged,
 * never returned to the client. Raw provider errors are mapped to safe codes.
 */

export type OpenAiCompatibleConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  defaultTimeoutMs?: number;
};

function mapHttpStatus(status: number): AiProviderError {
  if (status === 429) {
    return new AiProviderError("rate_limit", "Provider rate limit reached");
  }
  if (status >= 500) {
    return new AiProviderError("unavailable", "Provider unavailable");
  }
  // 4xx (401/403/400…) — never echo provider body to the user.
  return new AiProviderError("unavailable", "Provider rejected the request");
}

export function createOpenAiCompatibleProvider(
  config: OpenAiCompatibleConfig
): AiProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const timeoutMs = config.defaultTimeoutMs ?? 45_000;

  return {
    kind: "openai_compatible",
    name: "openai-compatible",
    model: config.model,
    async complete(request: AiProviderRequest): Promise<AiProviderResult> {
      const timeout = request.timeoutMs ?? timeoutMs;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: request.messages,
            max_tokens: request.maxTokens ?? 1200,
            temperature: 0.3,
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new AiProviderError("timeout", "AI request timed out");
        }
        throw new AiProviderError("unavailable", "AI provider unreachable");
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        throw mapHttpStatus(response.status);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AiProviderError("invalid_response", "Invalid provider response");
      }

      const body = payload as {
        choices?: Array<{ message?: { content?: unknown } }>;
        model?: unknown;
        usage?: {
          prompt_tokens?: unknown;
          completion_tokens?: unknown;
          total_tokens?: unknown;
        };
      };

      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new AiProviderError("empty_response", "Empty provider response");
      }

      const num = (v: unknown): number | undefined =>
        typeof v === "number" && Number.isFinite(v) ? v : undefined;

      return {
        text: content.trim(),
        model: typeof body.model === "string" ? body.model : config.model,
        usage: {
          promptTokens: num(body.usage?.prompt_tokens),
          completionTokens: num(body.usage?.completion_tokens),
          totalTokens: num(body.usage?.total_tokens),
        },
      };
    },
  };
}
