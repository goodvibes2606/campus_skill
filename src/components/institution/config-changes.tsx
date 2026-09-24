"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Change = {
  id: string;
  area: string;
  status: string;
  requesterName: string;
  reviewerName: string | null;
  reviewNote: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
};

export function ConfigChangeList({
  changes,
  canConfigure,
  canApprove,
}: {
  changes: Change[];
  canConfigure: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [moduleKey, setModuleKey] = useState("placement");
  const [enabled, setEnabled] = useState(false);

  async function transition(id: string, status: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/institution/changes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not update");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusyId(null);
    }
  }

  async function createChange(e: React.FormEvent) {
    e.preventDefault();
    setBusyId("new");
    setError(null);
    try {
      const res = await fetch("/api/institution/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: "modules",
          payload: { modules: { [moduleKey]: enabled } },
          submit: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not create change");
        return;
      }
      setShowCreate(false);
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="dash-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">changes</p>
          <h2>Config change requests</h2>
          <p className="page-description">
            Sensitive areas use Draft → In review → Approved → Published (or
            Rejected). Admin drafts and publishes; Director/Dean approves.
          </p>
        </div>
        {canConfigure ? (
          <button
            className="quiet-button"
            type="button"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? "Cancel" : "New module change"}
          </button>
        ) : null}
      </div>

      {showCreate ? (
        <form className="placement-form" onSubmit={createChange}>
          <div className="placement-field-row">
            <label className="placement-field">
              <span>Module key</span>
              <select
                value={moduleKey}
                onChange={(e) => setModuleKey(e.target.value)}
              >
                {[
                  "placement",
                  "ai_assistance",
                  "alumni",
                  "student_management",
                  "faculty",
                  "resources",
                  "syllabus",
                  "assignments",
                  "assessments",
                  "question_bank",
                  "calendar",
                  "notifications",
                ].map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="placement-check">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Request enable = {String(enabled)}
            </label>
          </div>
          <div className="auth-actions-row">
            <button
              className="auth-submit"
              type="submit"
              disabled={busyId === "new"}
            >
              {busyId === "new" ? "Creating…" : "Create & submit for review"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="auth-error">{error}</p> : null}

      {changes.length === 0 ? (
        <p className="placement-muted">No config changes yet.</p>
      ) : (
        <div className="inst-change-list">
          {changes.map((c) => (
            <div className="inst-change-row" key={c.id}>
              <div>
                <strong>{c.area}</strong>
                <p className="placement-muted">
                  {c.status} · by {c.requesterName}
                  {c.reviewerName ? ` · reviewed by ${c.reviewerName}` : ""}
                </p>
                {c.reviewNote ? (
                  <p className="placement-muted">Note: {c.reviewNote}</p>
                ) : null}
              </div>
              <div className="inst-change-actions">
                {canConfigure && c.status === "draft" ? (
                  <button
                    className="quiet-button"
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => transition(c.id, "in_review")}
                  >
                    Submit
                  </button>
                ) : null}
                {canApprove && c.status === "in_review" ? (
                  <>
                    <button
                      className="auth-submit"
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => transition(c.id, "approved")}
                    >
                      Approve
                    </button>
                    <button
                      className="quiet-button"
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => transition(c.id, "rejected")}
                    >
                      Reject
                    </button>
                  </>
                ) : null}
                {canConfigure && c.status === "approved" ? (
                  <button
                    className="auth-submit"
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => transition(c.id, "published")}
                  >
                    Publish
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
