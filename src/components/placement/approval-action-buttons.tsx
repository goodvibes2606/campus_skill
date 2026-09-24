"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApprovalActionButtons({
  kind,
  id,
  canApprove,
}: {
  kind: "company" | "opportunity" | "appointment";
  id: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(approve: boolean) {
    const label = approve ? "Approve" : "Reject";
    if (!window.confirm(`${label} this ${kind}?`)) return;
    setBusy(label);
    setError(null);
    try {
      let url = "";
      let body: Record<string, unknown> = {};
      if (kind === "company") {
        url = `/api/placement/companies/${id}`;
        body = { status: approve ? "approved" : "rejected" };
      } else if (kind === "opportunity") {
        url = `/api/placement/opportunities/${id}`;
        body = { status: approve ? "approved" : "rejected" };
      } else {
        url = `/api/placement/appointments/${id}`;
        body = { decision: approve ? "approve" : "reject" };
      }
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Decision failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(null);
    }
  }

  if (!canApprove) {
    return (
      <span className="placement-muted" style={{ flexShrink: 0 }}>
        Read-only
      </span>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
      <button
        className="auth-submit"
        type="button"
        disabled={busy !== null}
        onClick={() => decide(true)}
      >
        {busy === "Approve" ? "…" : "Approve"}
      </button>
      <button
        className="quiet-button"
        type="button"
        disabled={busy !== null}
        onClick={() => decide(false)}
      >
        {busy === "Reject" ? "…" : "Reject"}
      </button>
      {error ? (
        <span className="auth-error" style={{ width: "100%" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
