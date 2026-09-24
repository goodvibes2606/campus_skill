"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PUBLIC_FIELDS = [
  { key: "about", label: "About" },
  { key: "officialEmail", label: "Official email" },
  { key: "supportEmail", label: "Support email" },
  { key: "admissionEmail", label: "Admission email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "country", label: "Country" },
  { key: "website", label: "Website" },
  { key: "mapsUrl", label: "Maps link" },
  { key: "logoUrl", label: "Logo URL" },
  { key: "shortName", label: "Short name" },
  { key: "institutionType", label: "Institution type" },
  { key: "establishedYear", label: "Established year" },
  { key: "accreditation", label: "Accreditation" },
  { key: "contactPersonName", label: "Contact person" },
  { key: "contactPersonTitle", label: "Contact title" },
] as const;

export function PublicProfileToggles({
  publicProfile,
  logoUrl,
  about,
  officialEmail,
  phone,
  address,
  city,
  state,
  country,
  websiteUrl,
  mapsUrl,
  shortName,
  institutionType,
  establishedYear,
  accreditation,
  contactPersonName,
  contactPersonTitle,
  supportEmail,
  admissionEmail,
  readOnly,
}: {
  publicProfile: Record<string, unknown>;
  logoUrl?: string | null;
  about?: string | null;
  officialEmail?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  websiteUrl?: string | null;
  mapsUrl?: string | null;
  shortName?: string | null;
  institutionType?: string | null;
  establishedYear?: number | null;
  accreditation?: string | null;
  contactPersonName?: string | null;
  contactPersonTitle?: string | null;
  supportEmail?: string | null;
  admissionEmail?: string | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const source: Record<string, unknown> = {
    about,
    officialEmail,
    phone,
    address,
    city,
    state,
    country,
    website: websiteUrl,
    mapsUrl,
    logoUrl,
    shortName,
    institutionType,
    establishedYear:
      establishedYear !== null && establishedYear !== undefined
        ? String(establishedYear)
        : null,
    accreditation,
    contactPersonName,
    contactPersonTitle,
    supportEmail,
    admissionEmail,
  };

  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const f of PUBLIC_FIELDS) {
      out[f.key] = publicProfile[f.key] !== undefined;
    }
    return out;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (readOnly) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of PUBLIC_FIELDS) {
        if (selected[f.key]) {
          const v = source[f.key];
          if (v !== null && v !== undefined && v !== "") {
            payload[f.key] = v;
          }
        }
      }
      const res = await fetch("/api/institution/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area: "public_profile", publicProfile: payload }),
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
    <div className="dash-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">public_profile</p>
          <h2>Public directory fields</h2>
          <p className="page-description">
            Only checked fields are stored and exposed on the public page and
            API. Unchecked fields stay internal.
          </p>
        </div>
      </div>

      <div className="inst-toggle-grid">
        {PUBLIC_FIELDS.map((f) => (
          <label className="placement-check" key={f.key}>
            <input
              type="checkbox"
              checked={Boolean(selected[f.key])}
              disabled={readOnly}
              onChange={(e) =>
                setSelected((s) => ({ ...s, [f.key]: e.target.checked }))
              }
            />
            {f.label}
            {source[f.key] === null || source[f.key] === undefined || source[f.key] === "" ? (
              <span className="placement-muted"> (no value)</span>
            ) : null}
          </label>
        ))}
      </div>

      {error ? <p className="auth-error">{error}</p> : null}
      {saved ? <p className="placement-success">Public profile saved.</p> : null}

      {readOnly ? null : (
        <div className="auth-actions-row">
          <button
            className="auth-submit"
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save public profile"}
          </button>
        </div>
      )}
    </div>
  );
}
