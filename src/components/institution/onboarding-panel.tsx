"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OnboardingPanel({
  status,
  step,
  percent,
  canEdit,
}: {
  status: string;
  step: number;
  percent: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = [
    "Identity",
    "Contact",
    "Academic structure",
    "People",
    "Rules",
    "Communication",
    "Branding",
    "Review",
    "Publish",
  ];

  async function save(patch: {
    onboardingStatus?: string;
    onboardingStep?: number;
  }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/institution/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area: "onboarding", ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not save");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dash-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">onboarding</p>
          <h2>Institution onboarding</h2>
          <p className="page-description">
            Foundation progress only — no workflow engine. Status:{" "}
            <strong>{status}</strong> · Step {step}/9 · {percent}% complete.
          </p>
        </div>
      </div>

      <ol className="inst-onboarding-steps">
        {steps.map((label, i) => {
          const n = i + 1;
          const state =
            n < step ? "done" : n === step ? "current" : "todo";
          return (
            <li key={label} className={`inst-step inst-step-${state}`}>
              <span className="inst-step-num" aria-hidden="true">
                {n}
              </span>
              <span>{label}</span>
              {state === "current" ? (
                <span className="placement-muted">current</span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="placement-field-row">
        <label className="placement-field">
          <span>Status</span>
          <select
            value={status}
            disabled={!canEdit || saving}
            onChange={(e) => save({ onboardingStatus: e.target.value })}
          >
            <option value="draft">draft</option>
            <option value="in_progress">in_progress</option>
            <option value="ready">ready</option>
            <option value="published">published (activates institution)</option>
          </select>
        </label>
        <label className="placement-field">
          <span>Current step (1–9)</span>
          <input
            type="number"
            min={1}
            max={9}
            defaultValue={step}
            disabled={!canEdit || saving}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (n >= 1 && n <= 9 && n !== step) {
                save({ onboardingStep: n });
              }
            }}
          />
        </label>
      </div>

      {error ? <p className="auth-error">{error}</p> : null}
      <p className="placement-muted">
        Publishing sets institution status to active. Documented limitation:
        full multi-step wizard automation is deferred.
      </p>
    </div>
  );
}
