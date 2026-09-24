"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AppointmentDecisionButtons({
  appointmentId,
  status,
  canDecide,
}: {
  appointmentId: string;
  status: string;
  canDecide: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject" | "end") {
    const prompts: Record<string, string> = {
      approve:
        "Approve this appointment? Any previous active row of the same scope will be ended (history kept).",
      reject: "Reject this appointment request?",
      end: "End this active appointment?",
    };
    if (!window.confirm(prompts[decision])) return;
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch(`/api/placement/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
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

  if (!canDecide && status !== "pending") return null;

  const buttons: {
    decision: "approve" | "reject" | "end";
    label: string;
  }[] = [];
  if (canDecide && status === "pending") {
    buttons.push({ decision: "approve", label: "Approve" });
    buttons.push({ decision: "reject", label: "Reject" });
  }
  if (canDecide && status === "active") {
    buttons.push({ decision: "end", label: "End" });
  }

  if (!buttons.length) return null;

  return (
    <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
      {buttons.map((b) => (
        <button
          key={b.decision}
          className={b.decision === "reject" ? "quiet-button" : "auth-submit"}
          type="button"
          disabled={busy !== null}
          onClick={() => decide(b.decision)}
        >
          {busy === b.decision ? "…" : b.label}
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
