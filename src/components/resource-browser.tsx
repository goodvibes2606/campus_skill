"use client";

import { useCallback, useEffect, useState } from "react";

type ResourceItem = {
  id: string;
  title: string;
  description: string;
  resourceType: string;
  status: string;
  version: number;
  subjectName: string;
  subjectCode: string;
  sectionName: string;
  academicYear: string;
  semesterNumber: number;
  ownerName: string;
  isOwner: boolean;
  syllabusRef: string | null;
  unitRef: string | null;
  topicRef: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  updatedAt: string;
};

type ScopeOption = {
  sectionId: string;
  subjectId: string;
  label: string;
};

const TYPE_LABELS: Record<string, string> = {
  notes: "Notes",
  ppt: "PPT",
  pdf: "PDF",
  document: "Document",
  study_material: "Study Material",
};

/**
 * Minimal client for Milestone 4 testing.
 * Create form is shown only for roles that may create (faculty/HOD/admin).
 * Listing always comes from server-rendered props (already filtered).
 */
export function ResourceBrowser({
  roleName,
  userId,
  initialResources,
}: {
  roleName: string;
  userId: string;
  initialResources: ResourceItem[];
}) {
  const [resources, setResources] = useState(initialResources);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const canCreate =
    roleName === "faculty" ||
    roleName === "hod" ||
    roleName === "admin" ||
    roleName === "system_admin";

  // For create form: load faculty assignments or ask for IDs in advanced mode
  const [form, setForm] = useState({
    sectionId: "",
    subjectId: "",
    resourceType: "notes",
    title: "",
    description: "",
    syllabusRef: "",
    unitRef: "",
    topicRef: "",
    status: "draft",
    filename: "",
    mimeType: "",
    sizeBytes: "",
  });
  const [scopeOptions, setScopeOptions] = useState<ScopeOption[]>([]);
  const [scopeError, setScopeError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/resources?limit=50", { cache: "no-store" });
    if (!res.ok) {
      setError(`Failed to load (${res.status})`);
      return;
    }
    const data = await res.json();
    setResources(data.resources ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/resources?limit=50", { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setResources(data.resources ?? []);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load assignable scopes for faculty from academic context
  useEffect(() => {
    if (!canCreate) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/academic/context", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const assignments = (data.facultyAssignments ?? []) as Array<{
          section_id: string;
          subject_id: string;
          section_name: string;
          subject_name: string;
          subject_code: string;
          status: string;
        }>;
        const opts: ScopeOption[] = assignments
          .filter((a) => a.status === "active")
          .map((a) => ({
            sectionId: a.section_id,
            subjectId: a.subject_id,
            label: `${a.section_name} · ${a.subject_name} (${a.subject_code})`,
          }));
        setScopeOptions(opts);
        if (opts.length === 0 && roleName === "faculty") {
          setScopeError(
            "No active teaching assignments — cannot create resources yet."
          );
        }
      } catch {
        if (!cancelled) setScopeError("Could not load academic scope");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canCreate, roleName]);

  const filtered =
    filter === "all"
      ? resources
      : resources.filter((r) => r.resourceType === filter);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        sectionId: form.sectionId,
        subjectId: form.subjectId,
        resourceType: form.resourceType,
        title: form.title,
        description: form.description,
        syllabusRef: form.syllabusRef || null,
        unitRef: form.unitRef || null,
        topicRef: form.topicRef || null,
        status: form.status,
      };
      if (form.filename && form.mimeType && form.sizeBytes) {
        payload.upload = {
          filename: form.filename,
          mimeType: form.mimeType,
          sizeBytes: Number(form.sizeBytes),
        };
      }
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || `Create failed (${res.status})`);
        return;
      }
      setForm((f) => ({
        ...f,
        title: "",
        description: "",
        filename: "",
        mimeType: "",
        sizeBytes: "",
      }));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onStatus(id: string, status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/resources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || `Update failed (${res.status})`);
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="quick-grid" style={{ marginBottom: 24 }}>
        {["all", "notes", "ppt", "pdf", "document", "study_material"].map(
          (t) => (
            <button
              key={t}
              type="button"
              className={`quick-card ${filter === t ? "quick-card-green" : "quick-card-blue"}`}
              onClick={() => setFilter(t)}
              style={{ cursor: "pointer", textAlign: "left" }}
            >
              <strong>
                {t === "all" ? "All" : TYPE_LABELS[t] ?? t}
              </strong>
              <small>
                {t === "all"
                  ? `${resources.length} visible`
                  : `${resources.filter((r) => r.resourceType === t).length} shown`}
              </small>
            </button>
          )
        )}
      </div>

      {canCreate && (
        <form
          className="coming-soon-panel"
          style={{ marginBottom: 28 }}
          onSubmit={onCreate}
        >
          <p className="panel-label">Create resource</p>
          <h2>New academic material</h2>
          {scopeError && <p className="auth-error">{scopeError}</p>}
          <div className="auth-form">
            {scopeOptions.length > 0 ? (
              <label className="auth-field">
                <span>Teaching assignment</span>
                <select
                  required
                  value={
                    form.sectionId
                      ? `${form.sectionId}|${form.subjectId}`
                      : ""
                  }
                  onChange={(e) => {
                    const [sectionId, subjectId] = e.target.value.split("|");
                    setForm((f) => ({ ...f, sectionId, subjectId }));
                  }}
                >
                  <option value="" disabled>
                    Select section · subject
                  </option>
                  {scopeOptions.map((o) => (
                    <option
                      key={`${o.sectionId}|${o.subjectId}`}
                      value={`${o.sectionId}|${o.subjectId}`}
                    >
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="auth-field">
                  <span>Section ID</span>
                  <input
                    required
                    value={form.sectionId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sectionId: e.target.value }))
                    }
                    placeholder="uuid"
                  />
                </label>
                <label className="auth-field">
                  <span>Subject ID</span>
                  <input
                    required
                    value={form.subjectId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, subjectId: e.target.value }))
                    }
                    placeholder="uuid"
                  />
                </label>
              </>
            )}

            <label className="auth-field">
              <span>Type</span>
              <select
                value={form.resourceType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, resourceType: e.target.value }))
                }
              >
                <option value="notes">Notes</option>
                <option value="ppt">PPT</option>
                <option value="pdf">PDF</option>
                <option value="document">Document</option>
                <option value="study_material">Study Material</option>
              </select>
            </label>

            <label className="auth-field">
              <span>Title</span>
              <input
                required
                minLength={2}
                maxLength={200}
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </label>

            <label className="auth-field">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
              />
            </label>

            <div className="auth-form" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <label className="auth-field">
                <span>Syllabus ref</span>
                <input
                  value={form.syllabusRef}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, syllabusRef: e.target.value }))
                  }
                />
              </label>
              <label className="auth-field">
                <span>Unit ref</span>
                <input
                  value={form.unitRef}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, unitRef: e.target.value }))
                  }
                />
              </label>
              <label className="auth-field">
                <span>Topic ref</span>
                <input
                  value={form.topicRef}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, topicRef: e.target.value }))
                  }
                />
              </label>
            </div>

            <label className="auth-field">
              <span>Status</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>

            <details>
              <summary>Upload metadata (validation foundation)</summary>
              <label className="auth-field">
                <span>Filename</span>
                <input
                  value={form.filename}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, filename: e.target.value }))
                  }
                  placeholder="lecture-1.pdf"
                />
              </label>
              <label className="auth-field">
                <span>MIME type</span>
                <input
                  value={form.mimeType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, mimeType: e.target.value }))
                  }
                  placeholder="application/pdf"
                />
              </label>
              <label className="auth-field">
                <span>Size (bytes)</span>
                <input
                  value={form.sizeBytes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sizeBytes: e.target.value }))
                  }
                  placeholder="102400"
                />
              </label>
            </details>

            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Create resource"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="auth-error">{error}</p>}

      <div className="activity-panel">
        <p className="card-label">
          Visible resources ({filtered.length})
        </p>
        {filtered.length === 0 ? (
          <p className="muted-copy" style={{ padding: "16px 0" }}>
            No resources in your academic context yet.
          </p>
        ) : (
          <div className="activity-list">
            {filtered.map((r) => (
              <div className="activity-item" key={r.id}>
                <span
                  className={`activity-marker marker-${
                    r.resourceType === "notes"
                      ? "blue"
                      : r.resourceType === "ppt"
                        ? "orange"
                        : "green"
                  }`}
                />
                <div>
                  <strong>
                    {r.title}{" "}
                    <span className="status-pill">{r.status}</span>{" "}
                    <span className="muted-copy">v{r.version}</span>
                  </strong>
                  <small>
                    {TYPE_LABELS[r.resourceType] ?? r.resourceType} ·{" "}
                    {r.subjectName} ({r.subjectCode}) · Sec {r.sectionName} ·{" "}
                    {r.academicYear} · Sem {r.semesterNumber}
                    {r.syllabusRef ? ` · Syllabus ${r.syllabusRef}` : ""}
                    {r.unitRef ? ` · Unit ${r.unitRef}` : ""}
                    {r.topicRef ? ` · Topic ${r.topicRef}` : ""}
                    {r.originalFilename ? ` · ${r.originalFilename}` : ""}
                  </small>
                  <small>
                    by {r.ownerName}
                    {r.isOwner ? " (you)" : ""} ·{" "}
                    {new Date(r.updatedAt).toLocaleString()}
                  </small>
                </div>
                {r.isOwner && r.status !== "published" && (
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={busy}
                    onClick={() => onStatus(r.id, "published")}
                  >
                    Publish
                  </button>
                )}
                {r.isOwner && r.status === "published" && (
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={busy}
                    onClick={() => onStatus(r.id, "archived")}
                  >
                    Archive
                  </button>
                )}
                {r.isOwner && r.status === "archived" && (
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={busy}
                    onClick={() => onStatus(r.id, "draft")}
                  >
                    Unarchive
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="muted-copy" style={{ marginTop: 12 }}>
        Signed in as {roleName} ({userId.slice(0, 8)}…). File bytes are not
        stored yet — upload validation foundation only.
      </p>
    </div>
  );
}
