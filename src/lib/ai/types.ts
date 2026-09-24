/**
 * AI provider abstraction types (Milestone 10).
 * Provider-independent: the application never imports a vendor SDK here.
 * Secrets stay server-side (env only) and are never sent to the browser.
 */

export type AiProviderKind = "none" | "openai_compatible" | "mock";

export type AiFeature =
  | "explain_topic"
  | "summarize_content"
  | "revision_questions"
  | "explain_terms"
  | "study_outline"
  | "assignment_help"
  | "teaching_support"
  | "question_drafting"
  | "lesson_planning"
  | "institution_summary"
  | "placement_summary"
  | "technical_help";

export type AiContextKind =
  | "subject"
  | "resource"
  | "assignment"
  | "syllabus"
  | "opportunity"
  | "general";

/** Server-built, visibility-filtered context packet. Never client-supplied raw. */
export type SafeAiContext = {
  kind: AiContextKind;
  /** Human-readable label for the UI (title/name). */
  label: string;
  /** Short factual excerpt safe to send to the provider. */
  summary: string;
  /** Optional extra structured lines (unit/topic lists, status, etc.). */
  details?: string[];
  /** True when context was validated against the caller's scope. */
  validated: boolean;
};

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiProviderRequest = {
  messages: AiChatMessage[];
  /** Optional soft cap; provider may ignore. */
  maxTokens?: number;
  timeoutMs?: number;
};

export type AiProviderUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type AiProviderResult = {
  text: string;
  model: string;
  usage?: AiProviderUsage;
};

export type AiProviderErrorCode =
  | "not_configured"
  | "unavailable"
  | "timeout"
  | "rate_limit"
  | "invalid_response"
  | "empty_response";

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  constructor(code: AiProviderErrorCode, message: string) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
  }
}

/** Provider adapter contract — one method, no vendor types leak upward. */
export type AiProvider = {
  readonly kind: AiProviderKind;
  readonly name: string;
  readonly model: string;
  complete(request: AiProviderRequest): Promise<AiProviderResult>;
};

export class AiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiValidationError";
  }
}
