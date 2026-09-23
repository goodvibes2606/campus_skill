"use client";

import { useCallback, useMemo, useState } from "react";

import type { AiContextKind, AiFeature } from "@/lib/ai/types";

type FeatureMeta = {
  id: AiFeature;
  label: string;
  detail: string;
  placeholder: string;
  contextKinds: AiContextKind[];
};

type ContextOption = {
  kind: AiContextKind | "general";
  id: string;
  label: string;
};

type AssistResponse = {
  feature: AiFeature;
  featureLabel: string;
  response: string;
  context: { kind: string; label: string } | null;
  provider: string;
  model: string;
  remoteConfigured: boolean;
  durationMs: number;
  disclaimer: string;
};

export type AiWorkspaceProps = {
  roleName: string;
  features: FeatureMeta[];
  /** Pre-validated context options for pickers (server-filtered). */
  contextOptions: ContextOption[];
  /** Optional deep-link preselect from entry points. */
  initialFeature?: AiFeature | null;
  initialContextKind?: string | null;
  initialContextId?: string | null;
  initialContextLabel?: string | null;
};

type UiState =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: AssistResponse };

/**
 * Campus Skill AI workspace (Milestone 10).
 * Institutional portal feel — not a consumer chatbot. Mobile-first layout.
 * All authorization is server-side; this component only renders state.
 */
export function AiWorkspace({
  roleName,
  features,
  contextOptions,
  initialFeature,
  initialContextKind,
  initialContextId,
  initialContextLabel,
}: AiWorkspaceProps) {
  const initialFeatureId =
    initialFeature && features.some((f) => f.id === initialFeature)
      ? initialFeature
      : (features[0]?.id ?? null);

  const [feature, setFeature] = useState<AiFeature | null>(initialFeatureId);
  const [prompt, setPrompt] = useState("");
  const [contextKind, setContextKind] = useState<string>(
    initialContextKind || "general"
  );
  const [contextId, setContextId] = useState<string>(initialContextId || "");
  const [state, setState] = useState<UiState>({ kind: "empty" });

  const activeMeta = useMemo(
    () => features.find((f) => f.id === feature) ?? features[0] ?? null,
    [features, feature]
  );

  const filteredOptions = useMemo(() => {
    if (contextKind === "general") return [];
    return contextOptions.filter((o) => o.kind === contextKind);
  }, [contextOptions, contextKind]);

  const pickableKinds = useMemo(() => {
    if (!activeMeta) return ["general"] as string[];
    const set = new Set<string>(["general"]);
    for (const k of activeMeta.contextKinds) set.add(k);
    // Only kinds that actually have options (or general).
    return [...set].filter(
      (k) => k === "general" || contextOptions.some((o) => o.kind === k)
    );
  }, [activeMeta, contextOptions]);

  const clear = useCallback(() => {
    setPrompt("");
    setState({ kind: "empty" });
  }, []);

  const selectFeature = useCallback(
    (id: AiFeature) => {
      setFeature(id);
      const meta = features.find((f) => f.id === id);
      if (meta && !meta.contextKinds.includes(contextKind as AiContextKind)) {
        setContextKind("general");
        setContextId("");
      }
    },
    [features, contextKind]
  );

  const submit = useCallback(
    async (overridePrompt?: string) => {
      const text = (overridePrompt ?? prompt).trim();
      if (!feature || text.length < 2) return;
      setState({ kind: "loading" });
      try {
        const res = await fetch("/api/ai/assist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            feature,
            prompt: text,
            context:
              contextKind !== "general" && contextId
                ? { kind: contextKind, id: contextId }
                : { kind: "general" },
          }),
        });
        const data = (await res.json()) as AssistResponse & {
          message?: string;
        };
        if (!res.ok) {
          setState({
            kind: "error",
            message: data.message || "Request could not be completed.",
          });
          return;
        }
        setState({ kind: "ready", data });
      } catch {
        setState({
          kind: "error",
          message: "Network error. Check your connection and try again.",
        });
      }
    },
    [feature, prompt, contextKind, contextId]
  );

  if (features.length === 0) {
    return (
      <div className="ai-panel">
        <p className="empty-state">
          AI assistance is not available for your role.
        </p>
      </div>
    );
  }

  return (
    <div className="ai-workspace">
      <div className="ai-side">
        <div className="ai-side-block">
          <p className="eyebrow">Actions</p>
          <div className="ai-chip-row" role="list">
            {features.map((f) => (
              <button
                key={f.id}
                type="button"
                role="listitem"
                className={`ai-chip ${feature === f.id ? "ai-chip-active" : ""}`}
                onClick={() => selectFeature(f.id)}
                title={f.detail}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ai-side-block">
          <p className="eyebrow">Context</p>
          <div className="placement-field">
            <span>Attach authorized context</span>
            <select
              value={contextKind}
              onChange={(e) => {
                setContextKind(e.target.value);
                setContextId("");
              }}
            >
              {pickableKinds.map((k) => (
                <option key={k} value={k}>
                  {k === "general"
                    ? "No entity (general)"
                    : k.charAt(0).toUpperCase() + k.slice(1)}
                </option>
              ))}
            </select>
          </div>
          {contextKind !== "general" ? (
            <div className="placement-field" style={{ marginTop: 10 }}>
              <span>Item (server-validated)</span>
              <select
                value={contextId}
                onChange={(e) => setContextId(e.target.value)}
              >
                <option value="">Select…</option>
                {filteredOptions.map((o) => (
                  <option key={`${o.kind}:${o.id}`} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {filteredOptions.length === 0 ? (
                <p className="placement-muted">
                  No authorized items of this type yet.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="placement-muted" style={{ marginTop: 10 }}>
              General assistance — no entity attached. Context IDs are always
              re-checked on the server.
            </p>
          )}
          {initialContextLabel && contextId === initialContextId ? (
            <p className="placement-success" style={{ marginTop: 10 }}>
              Linked from: {initialContextLabel}
            </p>
          ) : null}
        </div>

        <div className="ai-side-block ai-role-note">
          <p className="eyebrow">Session</p>
          <p className="placement-muted">
            Role <strong>{roleName}</strong> · prompts are not stored · only
            usage metadata is logged.
          </p>
        </div>
      </div>

      <div className="ai-main">
        <div className="ai-main-head">
          <div>
            <p className="eyebrow">Campus Skill Assist</p>
            <h2>{activeMeta?.label ?? "AI assistance"}</h2>
            <p className="placement-muted">{activeMeta?.detail}</p>
          </div>
          <button type="button" className="quiet-button" onClick={clear}>
            Clear
          </button>
        </div>

        <form
          className="ai-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <textarea
            className="ai-input"
            rows={4}
            value={prompt}
            maxLength={4000}
            placeholder={activeMeta?.placeholder ?? "Ask for study assistance…"}
            onChange={(e) => setPrompt(e.target.value)}
            aria-label="AI request"
          />
          <div className="ai-composer-actions">
            <span className="placement-muted">
              {prompt.length}/4000 · explanation · draft · suggestions
            </span>
            <button
              type="submit"
              className="auth-submit"
              disabled={state.kind === "loading" || prompt.trim().length < 2}
            >
              {state.kind === "loading" ? "Working…" : "Send"}
            </button>
          </div>
        </form>

        <div className="ai-response-area" aria-live="polite">
          {state.kind === "empty" ? (
            <div className="ai-empty">
              <p className="empty-state">
                No response yet. Pick an action, optionally attach authorized
                context, and describe what you need. Responses are assistance
                and drafts — not official decisions.
              </p>
            </div>
          ) : null}

          {state.kind === "loading" ? (
            <div className="ai-panel ai-loading" role="status">
              <span className="skeleton-line skeleton-line-md" />
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-line-sm" />
              <p className="placement-muted">Preparing authorized context…</p>
            </div>
          ) : null}

          {state.kind === "error" ? (
            <div className="ai-panel ai-error" role="alert">
              <p className="eyebrow">Unable to complete</p>
              <p>{state.message}</p>
              <div className="auth-actions-row">
                <button
                  type="button"
                  className="text-link"
                  onClick={() => void submit()}
                >
                  Try again
                </button>
                <button type="button" className="quiet-button" onClick={clear}>
                  Reset
                </button>
              </div>
            </div>
          ) : null}

          {state.kind === "ready" ? (
            <div className="ai-panel ai-result">
              <div className="ai-result-meta">
                <span className="status-pill">
                  {state.data.remoteConfigured
                    ? state.data.model
                    : "local guidance"}
                </span>
                {state.data.context ? (
                  <span className="status-pill">
                    {state.data.context.kind}: {state.data.context.label}
                  </span>
                ) : null}
                <span className="status-pill">{state.data.featureLabel}</span>
              </div>
              <div className="ai-result-body">{state.data.response}</div>
              <p className="placement-muted ai-disclaimer">
                {state.data.disclaimer}
              </p>
              {!state.data.remoteConfigured ? (
                <p className="placement-muted">
                  No AI provider is configured on this deployment — showing a
                  safe local guidance draft. Administrators can set AI_PROVIDER
                  and AI_API_KEY server-side.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
