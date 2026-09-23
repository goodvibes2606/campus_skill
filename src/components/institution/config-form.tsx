"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ConfigPatch = {
  area: string;
  [key: string]: unknown;
};

export function InstitutionConfigForm({
  area,
  initial,
  title,
  description,
  fields,
  readOnly,
}: {
  area: string;
  initial: Record<string, unknown>;
  title: string;
  description: string;
  fields: {
    key: string;
    label: string;
    type?: "text" | "textarea" | "email" | "url" | "number" | "color";
    maxLength?: number;
    placeholder?: string;
  }[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const v = initial[f.key];
      out[f.key] = v === null || v === undefined ? "" : String(v);
    }
    return out;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload: ConfigPatch = { area };
      for (const f of fields) {
        const raw = values[f.key] ?? "";
        if (f.type === "number") {
          payload[f.key] = raw === "" ? null : Number(raw);
        } else {
          payload[f.key] = raw;
        }
      }
      const res = await fetch("/api/institution/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not save");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="placement-form dash-panel" onSubmit={handleSubmit}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{area}</p>
          <h2>{title}</h2>
          <p className="page-description">{description}</p>
        </div>
        {readOnly ? (
          <span className="placement-muted">Read-only</span>
        ) : null}
      </div>

      <div className="placement-field-row">
        {fields.map((f) => (
          <label className="placement-field" key={f.key}>
            <span>{f.label}</span>
            {f.type === "textarea" ? (
              <textarea
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
                maxLength={f.maxLength ?? 4000}
                rows={4}
                placeholder={f.placeholder}
                readOnly={readOnly}
              />
            ) : (
              <input
                type={f.type === "color" ? "color" : f.type || "text"}
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
                maxLength={f.maxLength ?? 500}
                placeholder={f.placeholder}
                readOnly={readOnly}
                disabled={readOnly}
              />
            )}
          </label>
        ))}
      </div>

      {error ? <p className="auth-error">{error}</p> : null}
      {saved ? <p className="placement-success">Saved.</p> : null}

      {readOnly ? null : (
        <div className="auth-actions-row">
          <button className="auth-submit" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </form>
  );
}
