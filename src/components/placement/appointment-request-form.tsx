"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AppointmentRequestForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [responsibility, setResponsibility] = useState("tpo");
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  if (!open) {
    return (
      <div className="auth-actions-row" style={{ marginBottom: 8 }}>
        <button className="auth-submit" type="button" onClick={() => setOpen(true)}>
          Request appointment
        </button>
        <span className="placement-muted">
          Creates a pending request — Director/Dean approves.
        </span>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/placement/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          responsibility,
          responsibilityTitle: title || undefined,
          departmentId: departmentId || null,
          startsOn: startsOn || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not request appointment");
        return;
      }
      setOpen(false);
      setNote("Appointment requested — awaiting Director/Dean approval.");
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
          <p className="eyebrow">Request</p>
          <h2>New appointment</h2>
        </div>
        <button className="quiet-button" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      <div className="placement-field-row">
        <label className="placement-field">
          <span>Person ID (profile UUID)</span>
          <input
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            required
            placeholder="Target faculty / HOD / TPO profile id"
          />
        </label>
        <label className="placement-field">
          <span>Responsibility</span>
          <select
            value={responsibility}
            onChange={(e) => setResponsibility(e.target.value)}
          >
            <option value="tpo">TPO (institution-wide)</option>
            <option value="placement_faculty">Placement faculty</option>
          </select>
        </label>
        <label className="placement-field">
          <span>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            placeholder={
              responsibility === "tpo"
                ? "Training & Placement Officer"
                : "Placement Faculty"
            }
          />
        </label>
        <label className="placement-field">
          <span>Department ID (optional scope)</span>
          <input
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            placeholder="Blank = institution-wide"
          />
        </label>
        <label className="placement-field">
          <span>Starts on</span>
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
        </label>
      </div>

      {error ? <p className="auth-error">{error}</p> : null}
      {note && !error ? <p className="placement-success">{note}</p> : null}

      <div className="auth-actions-row">
        <button className="auth-submit" type="submit" disabled={saving}>
          {saving ? "Submitting…" : "Request appointment"}
        </button>
      </div>
    </form>
  );
}
