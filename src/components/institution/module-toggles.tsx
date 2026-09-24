"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ModuleToggleList({
  modules,
  canEdit,
}: {
  modules: {
    moduleKey: string;
    enabled: boolean;
    isDefault: boolean;
    updatedAt: string | null;
  }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(moduleKey: string, enabled: boolean) {
    setBusyKey(moduleKey);
    setError(null);
    try {
      const res = await fetch("/api/institution/modules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleKey, enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not update module");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="dash-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">modules</p>
          <h2>Modules &amp; features</h2>
          <p className="page-description">
            Institution-scoped feature flags. Server-side authorization remains
            authoritative — toggling here is not the only gate. Existing modules
            are never auto-disabled.
          </p>
        </div>
      </div>

      <div className="inst-module-list">
        {modules.map((m) => (
          <div className="inst-module-row" key={m.moduleKey}>
            <div>
              <strong>{m.moduleKey.replace(/_/g, " ")}</strong>
              <p className="placement-muted">
                {m.isDefault
                  ? "Default (enabled — no explicit row)"
                  : m.enabled
                    ? "Enabled"
                    : "Disabled"}
              </p>
            </div>
            <label className="placement-check">
              <input
                type="checkbox"
                checked={m.enabled}
                disabled={!canEdit || busyKey === m.moduleKey}
                onChange={(e) => toggle(m.moduleKey, e.target.checked)}
              />
              {busyKey === m.moduleKey ? "Saving…" : "Enabled"}
            </label>
          </div>
        ))}
      </div>

      {error ? <p className="auth-error">{error}</p> : null}
      <p className="placement-muted">
        Disabling a module does not delete data. Sensitive bulk module changes
        can also go through the Draft → Review → Approve → Publish flow under
        Config changes.
      </p>
    </div>
  );
}
