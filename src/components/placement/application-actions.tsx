"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Transition = { to: string; label: string };

const STUDENT_TRANSITIONS: Record<string, Transition[]> = {
  submitted: [{ to: "withdrawn", label: "Withdraw" }],
  screening: [{ to: "withdrawn", label: "Withdraw" }],
  shortlisted: [{ to: "withdrawn", label: "Withdraw" }],
  interview: [{ to: "withdrawn", label: "Withdraw" }],
  offered: [{ to: "offer_declined", label: "Decline offer" }],
};

const OPERATOR_TRANSITIONS: Record<string, Transition[]> = {
  submitted: [
    { to: "screening", label: "Move to screening" },
    { to: "rejected", label: "Reject" },
  ],
  screening: [
    { to: "shortlisted", label: "Shortlist" },
    { to: "rejected", label: "Reject" },
  ],
  shortlisted: [
    { to: "interview", label: "Move to interview" },
    { to: "rejected", label: "Reject" },
  ],
  interview: [
    { to: "selected", label: "Select" },
    { to: "rejected", label: "Reject" },
  ],
  selected: [
    { to: "offered", label: "Create offer path" },
    { to: "rejected", label: "Reject" },
  ],
  offered: [
    { to: "joined", label: "Mark joined" },
    { to: "rejected", label: "Reject" },
  ],
};

export function ApplicationActions({
  applicationId,
  status,
  isStudent,
  isOperator,
  isOwn,
}: {
  applicationId: string;
  status: string;
  isStudent: boolean;
  isOperator: boolean;
  isOwn: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const transitions: Transition[] = isStudent
    ? isOwn
      ? (STUDENT_TRANSITIONS[status] ?? [])
      : []
    : isOperator
      ? (OPERATOR_TRANSITIONS[status] ?? [])
      : [];

  // Operator must not process their own application (self-deal guard).
  const effective = isOperator && isOwn && isStudent ? [] : transitions;

  async function transition(to: string) {
    const label =
      to === "withdrawn" || to === "offer_declined" || to === "rejected"
        ? `Confirm “${to.replace("_", " ")}”?`
        : `Move application to “${to}”?`;
    if (!window.confirm(label)) return;
    setBusy(to);
    setError(null);
    try {
      const res = await fetch(`/api/placement/applications/${applicationId}`, {
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

  if (!effective.length) {
    return (
      <p className="placement-muted" style={{ marginTop: 14 }}>
        {isStudent
          ? status === "joined" ||
            status === "offer_declined" ||
            status === "rejected" ||
            status === "withdrawn"
            ? "This application is closed."
            : "No actions available for your role."
          : "No pipeline actions available at this stage."}
      </p>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <p className="eyebrow">
        {isStudent ? "Your actions" : "Pipeline actions"}
      </p>
      <div className="auth-actions-row" style={{ marginTop: 8 }}>
        {effective.map((t) => (
          <button
            key={t.to}
            className={
              t.to === "rejected" || t.to === "withdrawn"
                ? "quiet-button"
                : "auth-submit"
            }
            type="button"
            disabled={busy !== null}
            onClick={() => transition(t.to)}
          >
            {busy === t.to ? "Working…" : t.label}
          </button>
        ))}
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
