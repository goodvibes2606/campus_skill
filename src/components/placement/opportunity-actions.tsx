"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatusActions } from "@/components/placement/status-actions";

export function OpportunityActions({
  opportunityId,
  status,
  canOperate,
  canApprove,
}: {
  opportunityId: string;
  status: string;
  canOperate: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function transition(to: string) {
    setBusy(to);
    setError(null);
    try {
      const res = await fetch(`/api/placement/opportunities/${opportunityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Status change failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(null);
    }
  }

  const operatorActions: { label: string; to: string; confirm?: string }[] = [];
  if (canOperate) {
    if (status === "draft" || status === "rejected") {
      operatorActions.push({
        label: "Submit for approval",
        to: "pending_approval",
      });
    }
    if (status === "approved") {
      operatorActions.push({
        label: "Open applications",
        to: "open",
        confirm: "Open this opportunity to eligible students?",
      });
    }
    if (status === "open") {
      operatorActions.push({ label: "Close", to: "closed" });
    }
    if (status === "closed") {
      operatorActions.push({ label: "Reopen", to: "open" });
    }
    if (status === "draft" || status === "archived") {
      operatorActions.push({ label: "Archive", to: "archived" });
    }
  }

  const approverActions: { label: string; to: string; confirm?: string }[] = [];
  if (canApprove && status === "pending_approval") {
    approverActions.push({
      label: "Approve",
      to: "approved",
      confirm: "Approve this opportunity?",
    });
    approverActions.push({
      label: "Reject",
      to: "rejected",
      confirm: "Reject this opportunity?",
    });
  }

  return (
    <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
      {operatorActions.length ? (
        <div>
          <p className="eyebrow">Operator actions</p>
          <div className="auth-actions-row" style={{ marginTop: 8 }}>
            {operatorActions.map((a) => (
              <button
                key={a.to}
                className="auth-submit"
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  if (a.confirm && !window.confirm(a.confirm)) return;
                  await transition(a.to);
                }}
              >
                {busy === a.to ? "Working…" : a.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {approverActions.length ? (
        <div>
          <p className="eyebrow">Director / Dean approval</p>
          <div className="auth-actions-row" style={{ marginTop: 8 }}>
            {approverActions.map((a) => (
              <button
                key={a.to}
                className="auth-submit"
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  if (a.confirm && !window.confirm(a.confirm)) return;
                  await transition(a.to);
                }}
              >
                {busy === a.to ? "Working…" : a.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="auth-error">{error}</p> : null}

      {!operatorActions.length && !approverActions.length ? (
        <p className="placement-muted">
          No status actions available for your role at this stage.
        </p>
      ) : null}

      <StatusActions
        actions={[]}
        endpoint={`/api/placement/opportunities/${opportunityId}`}
      />
    </div>
  );
}
