"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CompanyCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitNow, setSubmitNow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <div className="auth-actions-row" style={{ marginBottom: 8 }}>
        <button className="auth-submit" type="button" onClick={() => setOpen(true)}>
          New company
        </button>
        <span className="placement-muted">
          Creates a draft (or pending approval) company record.
        </span>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/placement/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          website,
          industry,
          location,
          contactName,
          contactEmail,
          status: submitNow ? "pending_approval" : "draft",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not create company");
        return;
      }
      setOpen(false);
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
          <p className="eyebrow">Create</p>
          <h2>New company</h2>
        </div>
        <button className="quiet-button" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      <div className="placement-field-row">
        <label className="placement-field">
          <span>Name *</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={120}
            required
          />
        </label>
        <label className="placement-field">
          <span>Industry</span>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            maxLength={120}
          />
        </label>
        <label className="placement-field">
          <span>Location</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={200}
          />
        </label>
        <label className="placement-field">
          <span>Website</span>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            maxLength={300}
          />
        </label>
        <label className="placement-field">
          <span>Contact name</span>
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            maxLength={120}
          />
        </label>
        <label className="placement-field">
          <span>Contact email</span>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            maxLength={200}
          />
        </label>
      </div>

      <label className="placement-check">
        <input
          type="checkbox"
          checked={submitNow}
          onChange={(e) => setSubmitNow(e.target.checked)}
        />
        Submit for Director/Dean approval now
      </label>

      {error ? <p className="auth-error">{error}</p> : null}

      <div className="auth-actions-row">
        <button className="auth-submit" type="submit" disabled={saving}>
          {saving ? "Creating…" : "Create company"}
        </button>
      </div>
    </form>
  );
}
