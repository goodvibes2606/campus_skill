"use client";

import { useCallback, useEffect, useState } from "react";

type NotificationItem = {
  id: string;
  event: string;
  title: string;
  body: string;
  priority: string;
  isRead: boolean;
  createdAt: string;
};

export function NotificationList({
  initialNotifications,
  initialUnread,
}: {
  initialNotifications: NotificationItem[];
  initialUnread: number;
}) {
  const [items, setItems] = useState(initialNotifications);
  const [unread, setUnread] = useState(initialUnread);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/notifications?limit=50", {
      cache: "no-store",
    });
    if (!res.ok) {
      setError(`Failed to load (${res.status})`);
      return;
    }
    const data = await res.json();
    setItems(data.notifications ?? []);
    setUnread(data.unreadCount ?? 0);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/notifications?limit=50", {
        cache: "no-store",
      });
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (!cancelled) {
        setItems(data.notifications ?? []);
        setUnread(data.unreadCount ?? 0);
        setError(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleRead(id: string, read: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read }),
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
      <div className="quick-grid" style={{ marginBottom: 24 }}>
        <div className="quick-card quick-card-blue">
          <strong>Unread</strong>
          <small>{unread} notifications</small>
        </div>
        <div className="quick-card quick-card-green">
          <strong>Total loaded</strong>
          <small>{items.length} shown</small>
        </div>
      </div>

      {error && <p className="auth-error">{error}</p>}

      <div className="activity-panel">
        <p className="card-label">Your notifications ({items.length})</p>
        {items.length === 0 ? (
          <p className="muted-copy" style={{ padding: "16px 0" }}>
            No notifications yet.
          </p>
        ) : (
          <div className="activity-list">
            {items.map((n) => (
              <div className="activity-item" key={n.id}>
                <span
                  className={`activity-marker ${
                    n.priority === "urgent" || n.priority === "high"
                      ? "marker-orange"
                      : n.isRead
                        ? "marker-green"
                        : "marker-blue"
                  }`}
                />
                <div>
                  <strong>
                    {n.title}{" "}
                    {!n.isRead && <span className="status-pill">unread</span>}{" "}
                    <span className="status-pill">{n.priority}</span>
                  </strong>
                  <small>
                    {n.event} · {new Date(n.createdAt).toLocaleString()}
                  </small>
                  {n.body && <small>{n.body}</small>}
                </div>
                <button
                  type="button"
                  className="quiet-button"
                  disabled={busy}
                  onClick={() => toggleRead(n.id, !n.isRead)}
                >
                  {n.isRead ? "Mark unread" : "Mark read"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
