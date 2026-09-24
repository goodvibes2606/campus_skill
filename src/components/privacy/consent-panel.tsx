"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ConsentStatus } from "@/lib/privacy";

const KIND_LABELS: Record<string, string> = {
  privacy_notice: "Privacy notice",
  data_handling: "Data handling",
  ai_notice: "AI notice",
  terms_ack: "Terms acknowledgement",
};

export function ConsentPanel({ initial }: { initial: ConsentStatus[] }) {
  const router = useRouter();
  const [statuses, setStatuses] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openKind, setOpenKind] = useState<string | null>(null);

  async function accept(kind: string, version: string) {
    setError(null);
    setBusy(kind);
    try {
      const res = await fetch("/api/privacy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, version }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Unable to record acknowledgement.");
        return;
      }
      setStatuses((prev) =>
        prev.map((s) =>
          s.kind === kind
            ? {
                ...s,
                accepted: true,
                acceptedAt: new Date(json.consent?.acceptedAt ?? Date.now()),
              }
            : s
        )
      );
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="privacy-panel">
      <p className="placement-muted">
        Acknowledgements are stored per account with the notice version and
        timestamp. Institutions may customize wording; defaults apply when
        unset.
      </p>
      {error && (
        <p className="auth-error" role="alert" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
      <div className="inst-change-list">
        {statuses.map((s) => (
          <div className="inst-change-row" key={s.kind}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <strong>
                {KIND_LABELS[s.kind] ?? s.kind}{" "}
                <span className="placement-muted">({s.source})</span>
              </strong>
              <p className="placement-muted">
                Version {s.version}
                {s.accepted && s.acceptedAt
                  ? ` · accepted ${new Date(s.acceptedAt).toLocaleString()}`
                  : s.accepted
                    ? " · accepted"
                    : " · not yet acknowledged"}
              </p>
              {openKind === s.kind && (
                <p className="placement-body">{s.text}</p>
              )}
            </div>
            <div className="inst-change-actions">
              <button
                className="quiet-button"
                type="button"
                onClick={() =>
                  setOpenKind((k) => (k === s.kind ? null : s.kind))
                }
              >
                {openKind === s.kind ? "Hide text" : "Read notice"}
              </button>
              {s.accepted ? (
                <span className="status-pill">Acknowledged</span>
              ) : (
                <button
                  className="auth-submit"
                  type="button"
                  style={{ padding: "8px 12px", fontSize: 11 }}
                  disabled={busy === s.kind}
                  onClick={() => accept(s.kind, s.version)}
                >
                  {busy === s.kind ? "Saving…" : "Acknowledge"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
