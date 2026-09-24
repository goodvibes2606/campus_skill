"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OpportunityCreateForm({
  companies,
}: {
  companies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("job");
  const [location, setLocation] = useState("");
  const [compensation, setCompensation] = useState("");
  const [deadline, setDeadline] = useState("");
  const [submitForApproval, setSubmitForApproval] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <div className="auth-actions-row" style={{ marginBottom: 8 }}>
        <button
          className="auth-submit"
          type="button"
          onClick={() => setOpen(true)}
          disabled={companies.length === 0}
        >
          New opportunity
        </button>
        <span className="placement-muted">
          {companies.length === 0
            ? "Approve a company first — opportunities require an approved company."
            : "Creates a draft (or pending approval) opportunity."}
        </span>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/placement/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          title,
          description,
          opportunityKind: kind,
          location,
          compensation,
          applicationDeadline: deadline || null,
          status: submitForApproval ? "pending_approval" : "draft",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not create opportunity");
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
          <h2>New opportunity</h2>
        </div>
        <button
          className="quiet-button"
          type="button"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>

      <label className="placement-field">
        <span>Company</span>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          required
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="placement-field">
        <span>Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          required
          placeholder="Software Engineer Intern"
        />
      </label>

      <label className="placement-field">
        <span>Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={8000}
        />
      </label>

      <div className="placement-field-row">
        <label className="placement-field">
          <span>Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="job">Job</option>
            <option value="internship">Internship</option>
          </select>
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
          <span>Compensation</span>
          <input
            value={compensation}
            onChange={(e) => setCompensation(e.target.value)}
            maxLength={300}
            placeholder="Free text foundation"
          />
        </label>
        <label className="placement-field">
          <span>Deadline</span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
      </div>

      <label className="placement-check">
        <input
          type="checkbox"
          checked={submitForApproval}
          onChange={(e) => setSubmitForApproval(e.target.checked)}
        />
        Submit for Director/Dean approval now
      </label>

      {error ? <p className="auth-error">{error}</p> : null}

      <div className="auth-actions-row">
        <button className="auth-submit" type="submit" disabled={saving}>
          {saving ? "Creating…" : "Create opportunity"}
        </button>
      </div>
    </form>
  );
}
