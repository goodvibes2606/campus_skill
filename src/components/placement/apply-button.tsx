"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApplyButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [coverNote, setCoverNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleApply() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/placement/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, coverNote }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not submit application");
        return;
      }
      router.push(`/placement/applications/${data.application.id}`);
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12, width: "100%" }}>
      <label className="placement-field">
        <span>Cover note (optional)</span>
        <textarea
          value={coverNote}
          onChange={(e) => setCoverNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Why you are a fit — reviewed by the placement cell"
        />
      </label>
      {error ? <p className="auth-error">{error}</p> : null}
      <button
        className="auth-submit"
        type="button"
        onClick={handleApply}
        disabled={saving}
      >
        {saving ? "Submitting…" : "Apply now"}
      </button>
      <span className="placement-muted">
        Eligibility and open status are re-checked on the server before your
        application is accepted.
      </span>
    </div>
  );
}
