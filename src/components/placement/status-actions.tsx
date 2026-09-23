"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action = {
  label: string;
  to: string;
  confirm?: string;
  tone?: "primary" | "quiet";
};

export function StatusActions({
  actions,
  endpoint,
  idField = "id",
}: {
  actions: Action[];
  endpoint: string;
  idField?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: Action) {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setBusy(action.to);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [idField]: action.to }),
      });
      // Support both { status } and { decision } style endpoints via body key
      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        // Retry with status key if endpoint expects status
        const retry = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: action.to }),
        });
        if (!retry.ok) {
          const retryData = await retry.json().catch(() => ({}));
          setError(retryData.message || data.message || "Action failed");
          return;
        }
      } else if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Action failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="auth-actions-row">
        {actions.map((a) => (
          <button
            key={`${a.to}-${a.label}`}
            className={a.tone === "quiet" ? "quiet-button" : "auth-submit"}
            type="button"
            disabled={busy !== null}
            onClick={() => run(a)}
          >
            {busy === a.to ? "Working…" : a.label}
          </button>
        ))}
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
