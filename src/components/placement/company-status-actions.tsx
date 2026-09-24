"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CompanyStatusActions({
  companyId,
  status,
  canOperate,
  canApprove,
}: {
  companyId: string;
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
      const res = await fetch(`/api/placement/companies/${companyId}`, {
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

  const actions: { label: string; to: string; confirm?: string }[] = [];
  if (canOperate) {
    if (status === "draft" || status === "rejected") {
      actions.push({ label: "Submit", to: "pending_approval" });
    }
    if (status === "pending_approval" || status === "approved") {
      actions.push({ label: "Archive", to: "archived" });
    }
    if (status === "archived" || status === "approved") {
      actions.push({ label: "Draft", to: "draft" });
    }
  }
  if (canApprove && status === "pending_approval") {
    actions.push({
      label: "Approve",
      to: "approved",
      confirm: "Approve this company?",
    });
    actions.push({
      label: "Reject",
      to: "rejected",
      confirm: "Reject this company?",
    });
  }

  if (!actions.length) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0 }}>
      {actions.map((a) => (
        <button
          key={a.to}
          className="quiet-button"
          type="button"
          style={{ marginLeft: 0 }}
          disabled={busy !== null}
          onClick={async () => {
            if (a.confirm && !window.confirm(a.confirm)) return;
            await transition(a.to);
          }}
        >
          {busy === a.to ? "…" : a.label}
        </button>
      ))}
      {error ? (
        <span className="auth-error" style={{ width: "100%" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
