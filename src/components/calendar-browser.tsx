"use client";

import { useCallback, useEffect, useState } from "react";

type CalendarItem = {
  id: string;
  title: string;
  description: string;
  eventType: string;
  startsOn: string;
  endsOn: string;
  status: string;
  departmentCode: string | null;
  creatorName: string;
  isCreator: boolean;
  approvalNote: string | null;
  circulatedAt: string | null;
};

const STATUS_ACTIONS: Array<{ from: string; to: string; label: string }> = [
  { from: "draft", to: "pending_approval", label: "Submit" },
  { from: "pending_approval", to: "approved", label: "Approve" },
  { from: "pending_approval", to: "rejected", label: "Reject" },
  { from: "pending_approval", to: "draft", label: "Withdraw" },
  { from: "approved", to: "published", label: "Publish" },
  { from: "rejected", to: "draft", label: "Revise" },
  { from: "published", to: "archived", label: "Archive" },
  { from: "archived", to: "draft", label: "Reopen" },
];

export function CalendarBrowser({
  roleName,
  userId,
  initialEvents,
}: {
  roleName: string;
  userId: string;
  initialEvents: CalendarItem[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canCreate =
    roleName === "faculty" ||
    roleName === "hod" ||
    roleName === "admin" ||
    roleName === "system_admin";

  const [form, setForm] = useState({
    title: "",
    description: "",
    eventType: "event",
    startsOn: "",
    endsOn: "",
  });

  const refresh = useCallback(async () => {
    const res = await fetch("/api/calendar?limit=50", { cache: "no-store" });
    if (!res.ok) {
      setError(`Failed to load (${res.status})`);
      return;
    }
    const data = await res.json();
    setEvents(data.events ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/calendar?limit=50", { cache: "no-store" });
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (!cancelled) {
        setEvents(data.events ?? []);
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
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || `Create failed (${res.status})`);
        return;
      }
      setForm({
        title: "",
        description: "",
        eventType: "event",
        startsOn: "",
        endsOn: "",
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onStatus(id: string, status: string, approvalNote?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, approvalNote }),
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

  return (
    <div>
      {error && <p className="auth-error">{error}</p>}

      {canCreate && (
        <form
          className="coming-soon-panel"
          style={{ marginBottom: 24 }}
          onSubmit={onCreate}
        >
          <p className="panel-label">Create calendar event</p>
          <h2>Institutional date (draft)</h2>
          <div className="auth-form">
            <label className="auth-field">
              <span>Title</span>
              <input
                required
                minLength={2}
                maxLength={200}
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </label>
            <label className="auth-field">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
              />
            </label>
            <label className="auth-field">
              <span>Type</span>
              <select
                value={form.eventType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, eventType: e.target.value }))
                }
              >
                <option value="event">Event</option>
                <option value="holiday">Holiday</option>
                <option value="exam">Exam</option>
                <option value="deadline">Deadline</option>
                <option value="class_start">Class start</option>
                <option value="class_end">Class end</option>
                <option value="meeting">Meeting</option>
                <option value="other">Other</option>
              </select>
            </label>
            <div
              className="auth-form"
              style={{ gridTemplateColumns: "1fr 1fr" }}
            >
              <label className="auth-field">
                <span>Starts</span>
                <input
                  required
                  type="date"
                  value={form.startsOn}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startsOn: e.target.value }))
                  }
                />
              </label>
              <label className="auth-field">
                <span>Ends</span>
                <input
                  required
                  type="date"
                  value={form.endsOn}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endsOn: e.target.value }))
                  }
                />
              </label>
            </div>
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Create draft"}
            </button>
          </div>
        </form>
      )}

      <div className="activity-panel">
        <p className="card-label">Calendar events ({events.length})</p>
        {events.length === 0 ? (
          <p className="muted-copy" style={{ padding: "16px 0" }}>
            No calendar events in your scope yet.
          </p>
        ) : (
          <div className="activity-list">
            {events.map((e) => (
              <div className="activity-item" key={e.id}>
                <span className="activity-marker marker-orange" />
                <div>
                  <strong>
                    {e.title} <span className="status-pill">{e.status}</span>
                  </strong>
                  <small>
                    {e.eventType} · {e.startsOn}
                    {e.endsOn !== e.startsOn ? ` → ${e.endsOn}` : ""}
                    {e.departmentCode ? ` · ${e.departmentCode}` : " · Institution-wide"}
                    {e.circulatedAt
                      ? ` · circulated ${new Date(e.circulatedAt).toLocaleDateString()}`
                      : ""}
                  </small>
                  <small>
                    by {e.creatorName}
                    {e.approvalNote ? ` · note: ${e.approvalNote}` : ""}
                  </small>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {STATUS_ACTIONS.filter((a) => a.from === e.status).map(
                    (a) => {
                      const isApproverAction =
                        a.to === "approved" ||
                        a.to === "rejected" ||
                        a.to === "published";
                      const mayAct =
                        e.isCreator ||
                        isApproverAction ||
                        roleName === "admin" ||
                        roleName === "system_admin" ||
                        roleName === "hod";
                      if (!mayAct && !e.isCreator) return null;
                      return (
                        <button
                          key={a.to}
                          type="button"
                          className="quiet-button"
                          disabled={busy || !mayAct}
                          onClick={() => onStatus(e.id, a.to)}
                        >
                          {a.label}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="muted-copy" style={{ marginTop: 12 }}>
        Signed in as {roleName} ({userId.slice(0, 8)}…). Publish after approval
        to circulate in-app notifications.
      </p>
    </div>
  );
}
