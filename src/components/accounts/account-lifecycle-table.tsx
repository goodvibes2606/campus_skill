"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Row = {
  id: string;
  fullName: string;
  email: string;
  status: string;
  roleName: string;
};

const OPTIONS = [
  "active",
  "suspended",
  "inactive",
  "graduated",
  "left",
] as const;

export function AccountLifecycleTable({
  users,
  currentUserId,
  canEdit,
}: {
  users: Row[];
  currentUserId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function changeStatus(id: string, status: string) {
    if (
      id === currentUserId &&
      status !== "active" &&
      !confirm("Change your own account status? You may lose workspace access.")
    ) {
      return;
    }
    const reason =
      status === "suspended" || status === "left" || status === "inactive"
        ? window.prompt("Reason (stored in audit):") || undefined
        : undefined;
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch("/api/account/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: id, status, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Unable to change status.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  if (!users.length) {
    return <p className="empty-state">No accounts match this filter.</p>;
  }

  return (
    <>
      {error && (
        <p className="auth-error" role="alert" style={{ marginBottom: 10 }}>
          {error}
        </p>
      )}
      <div className="inst-table-wrap">
        <table className="inst-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Change status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.fullName || "—"}
                  {u.id === currentUserId ? (
                    <span className="placement-muted"> (you)</span>
                  ) : null}
                </td>
                <td>{u.email}</td>
                <td>
                  <span className="inst-role-chip">{u.roleName}</span>
                </td>
                <td>
                  <span className="status-pill">{u.status}</span>
                </td>
                <td>
                  {canEdit ? (
                    <select
                      aria-label={`Status for ${u.email}`}
                      value={OPTIONS.includes(u.status as never) ? u.status : "active"}
                      disabled={busyId === u.id || (u.id === currentUserId && false)}
                      onChange={(e) => changeStatus(u.id, e.target.value)}
                      style={{
                        background: "var(--paper)",
                        border: "1px solid var(--line)",
                        borderRadius: 6,
                        fontSize: 11,
                        padding: "6px 8px",
                      }}
                    >
                      {OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                      {!OPTIONS.includes(u.status as never) && (
                        <option value={u.status}>{u.status}</option>
                      )}
                    </select>
                  ) : (
                    u.status
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
