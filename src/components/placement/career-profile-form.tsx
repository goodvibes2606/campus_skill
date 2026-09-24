"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ProfileDraft = {
  headline: string;
  summary: string;
  skills: string[];
  careerInterests: string[];
  resumeReference: string;
  readiness: string;
  enrollmentContext: string | null;
};

export function CareerProfileForm({ initial }: { initial: ProfileDraft }) {
  const router = useRouter();
  const [headline, setHeadline] = useState(initial.headline);
  const [summary, setSummary] = useState(initial.summary);
  const [skills, setSkills] = useState(initial.skills.join(", "));
  const [interests, setInterests] = useState(initial.careerInterests.join(", "));
  const [resumeReference, setResumeReference] = useState(initial.resumeReference);
  const [readiness, setReadiness] = useState(initial.readiness);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/placement/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline,
          summary,
          skills,
          careerInterests: interests,
          resumeReference: resumeReference || null,
          readiness,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not save profile");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="placement-form dash-panel" onSubmit={handleSubmit}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Editable fields</p>
          <h2>Career details</h2>
        </div>
        <span className="status-pill">
          {readiness.replace("_", " ")}
        </span>
      </div>

      {initial.enrollmentContext ? (
        <p className="placement-muted">
          Enrollment: {initial.enrollmentContext}
        </p>
      ) : (
        <p className="placement-muted">
          No active enrollment — complete enrollment before applying to
          opportunities.
        </p>
      )}

      <label className="placement-field">
        <span>Headline</span>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={160}
          placeholder="e.g. Final-year CSE student · backend &amp; cloud"
        />
      </label>

      <label className="placement-field">
        <span>Summary</span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Short professional summary (no AI-generated resume text)"
        />
      </label>

      <label className="placement-field">
        <span>Skills (comma or newline separated)</span>
        <textarea
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          rows={3}
          placeholder="Python, SQL, React, communication"
        />
      </label>

      <label className="placement-field">
        <span>Career interests</span>
        <textarea
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
          rows={3}
          placeholder="Software engineering, data analytics, consulting"
        />
      </label>

      <label className="placement-field">
        <span>Resume reference (link or file id)</span>
        <input
          value={resumeReference}
          onChange={(e) => setResumeReference(e.target.value)}
          maxLength={500}
          placeholder="Optional — storage wiring comes later"
        />
      </label>

      <label className="placement-field">
        <span>Career readiness</span>
        <select value={readiness} onChange={(e) => setReadiness(e.target.value)}>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="ready">Ready</option>
        </select>
      </label>

      {error ? <p className="auth-error">{error}</p> : null}
      {saved && !error ? (
        <p className="placement-success">Profile saved.</p>
      ) : null}

      <div className="auth-actions-row">
        <button className="auth-submit" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        <span className="placement-muted">
          Editing is limited to your own account (server-checked).
        </span>
      </div>
    </form>
  );
}
