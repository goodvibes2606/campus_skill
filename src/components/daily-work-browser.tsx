"use client";

import { useCallback, useEffect, useState } from "react";

type DailyWorkItem = {
  id: string;
  workType: string;
  description: string;
  durationMinutes: number | null;
};

type DailyWorkReport = {
  id: string;
  reportDate: string;
  summary: string;
  status: string;
  reporterName: string;
  departmentCode: string | null;
  isReporter: boolean;
  returnNote: string | null;
  items: DailyWorkItem[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DailyWorkBrowser({
  roleName,
  userId,
  initialReports,
}: {
  roleName: string;
  userId: string;
  initialReports: DailyWorkReport[];
}) {
  const [reports, setReports] = useState(initialReports);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canFile = roleName === "faculty" || roleName === "hod" || roleName === "admin" || roleName === "system_admin";

  const [form, setForm] = useState({
    reportDate: todayIso(),
    summary: "",
    itemText: "",
    status: "submitted",
  });

  const refresh = useCallback(async () => {
    const res = await fetch("/api/daily-work?limit=50", { cache: "no-store" });
    if (!res.ok) {
      setError(`Failed to load (${res.status})`);
      return;
    }
    const data = await res.json();
    setReports(data.reports ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/daily-work?limit=50", { cache: "no-store" });
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (!cancelled) {
        setReports(data.reports ?? []);
        setError(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const items = form.itemText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((description) => ({ workType: "lecture", description }));
      const res = await fetch("/api/daily-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDate: form.reportDate,
          summary: form.summary,
          status: form.status,
          items,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || `Create failed (${res.status})`);
        return;
      }
      setForm((f) => ({ ...f, summary: "", itemText: "" }));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onStatus(id: string, status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/daily-work/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || `Update failed (${res.status})`);
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const canAcknowledge =
    roleName === "hod" || roleName === "admin" || roleName === "system_admin";

  return (
    <div>
      {error && <p className="auth-error">{error}</p>}

      {canFile && (
        <form
          className="coming-soon-panel"
          style={{ marginBottom: 24 }}
          onSubmit={onCreate}
        >
          <p className="panel-label">File daily work</p>
          <h2>New report</h2>
          <div className="auth-form">
            <div
              className="auth-form"
              style={{ gridTemplateColumns: "1fr 1fr" }}
            >
              <label className="auth-field">
                <span>Date</span>
                <input
                  required
                  type="date"
                  value={form.reportDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reportDate: e.target.value }))
                  }
                />
              </label>
              <label className="auth-field">
                <span>Initial status</span>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                </select>
              </label>
            </div>
            <label className="auth-field">
              <span>Summary</span>
              <textarea
                value={form.summary}
                onChange={(e) =>
                  setForm((f) => ({ ...f, summary: e.target.value }))
                }
                rows={2}
                placeholder="What did you do today?"
              />
            </label>
            <label className="auth-field">
              <span>Work items (one per line)</span>
              <textarea
                value={form.itemText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, itemText: e.target.value }))
                }
                rows={3}
                placeholder={"Lecture: Unit 2 to Sec A\nLab: DB practical"}
              />
            </label>
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save report"}
            </button>
          </div>
        </form>
      )}

      <div className="activity-panel">
        <p className="card-label">Reports visible to you ({reports.length})</p>
        {reports.length === 0 ? (
          <p className="muted-copy" style={{ padding: "16px 0" }}>
            No daily work reports yet.
          </p>
        ) : (
          <div className="activity-list">
            {reports.map((r) => (
              <div className="activity-item" key={r.id}>
                <span className="activity-marker marker-green" />
                <div>
                  <strong>
                    {r.reportDate}{" "}
                    <span className="status-pill">{r.status}</span>
                  </strong>
                  <small>
                    {r.reporterName}
                    {r.departmentCode ? ` · ${r.departmentCode}` : ""}
                    {r.returnNote ? ` · ${r.returnNote}` : ""}
                  </small>
                  {r.summary && <small>{r.summary}</small>}
                  {r.items.length > 0 && (
                    <small>
                      {r.items.map((i) => i.description).join(" · ")}
                    </small>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {r.isReporter && (r.status === "draft" || r.status === "returned") && (
                    <button
                      type="button"
                      className="quiet-button"
                      disabled={busy}
                      onClick={() => onStatus(r.id, "submitted")}
                    >
                      Submit
                    </button>
                  )}
                  {r.isReporter && r.status === "submitted" && (
                    <button
                      type="button"
                      className="quiet-button"
                      disabled={busy}
                      onClick={() => onStatus(r.id, "draft")}
                    >
                      Unsubmit
                    </button>
                  )}
                  {!r.isReporter && canAcknowledge && r.status === "submitted" && (
                    <>
                      <button
                        type="button"
                        className="quiet-button"
                        disabled={busy}
                        onClick={() => onStatus(r.id, "acknowledged")}
                      >
                        Acknowledge
                      </button>
                      <button
                        type="button"
                        className="quiet-button"
                        disabled={busy}
                        onClick={() => onStatus(r.id, "returned")}
                      >
                        Return
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="muted-copy" style={{ marginTop: 12 }}>
        Signed in as {roleName} ({userId.slice(0, 8)}…).
      </p>
    </div>
  );
}
