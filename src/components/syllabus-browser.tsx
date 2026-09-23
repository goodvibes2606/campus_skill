"use client";

import { useCallback, useEffect, useState } from "react";

type SyllabusItem = {
  id: string;
  title: string;
  description: string;
  version: number;
  status: string;
  sourceType: string;
  sourceReference: string | null;
  sourceIsOfficial: boolean;
  subjectName: string;
  subjectCode: string;
  academicYear: string;
  unitCount: number;
  creatorName: string;
  isOwner: boolean;
};

type UnitItem = {
  id: string;
  unitNumber: number;
  title: string;
  description: string;
};

type TopicItem = {
  id: string;
  topicNumber: number;
  title: string;
};

type SelectOption = { id: string; label: string };

const STATUS_ACTIONS: Array<{ from: string; to: string; label: string }> = [
  { from: "draft", to: "in_review", label: "Submit review" },
  { from: "in_review", to: "approved", label: "Approve" },
  { from: "in_review", to: "draft", label: "Reject" },
  { from: "approved", to: "published", label: "Publish" },
  { from: "published", to: "archived", label: "Archive" },
  { from: "archived", to: "draft", label: "Reopen" },
];

/**
 * Minimal syllabus UI for Milestone 5 verification.
 * Create options load from /api/academic/context + subjects/years when available;
 * advanced mode accepts raw IDs.
 */
export function SyllabusBrowser({
  roleName,
  initialSyllabi,
}: {
  roleName: string;
  initialSyllabi: SyllabusItem[];
}) {
  const [syllabi, setSyllabi] = useState(initialSyllabi);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<SyllabusItem | null>(null);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [topicsByUnit, setTopicsByUnit] = useState<Record<string, TopicItem[]>>(
    {}
  );
  const [versions, setVersions] = useState<
    Array<{ id: string; version: number; status: string; changeNote: string | null }>
  >([]);

  const canCreate =
    roleName === "faculty" ||
    roleName === "hod" ||
    roleName === "admin" ||
    roleName === "system_admin";

  const [form, setForm] = useState({
    subjectId: "",
    academicYearId: "",
    title: "",
    description: "",
    sourceType: "faculty_prepared",
    sourceReference: "",
    sourceNotes: "",
  });
  const [unitForm, setUnitForm] = useState({ title: "", description: "" });
  const [topicForm, setTopicForm] = useState<Record<string, string>>({});
  const [subjectOptions, setSubjectOptions] = useState<SelectOption[]>([]);
  const [yearOptions, setYearOptions] = useState<SelectOption[]>([]);
  const [scopeNote, setScopeNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/syllabi?limit=50", { cache: "no-store" });
    if (!res.ok) {
      setError(`Failed to load (${res.status})`);
      return;
    }
    const data = await res.json();
    setSyllabi(data.syllabi ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/syllabi?limit=50", { cache: "no-store" });
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (!cancelled) {
        setSyllabi(data.syllabi ?? []);
        setError(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canCreate) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/academic/context", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const subjects = (data.subjects ??
          data.facultyAssignments ??
          []) as Array<Record<string, unknown>>;
        const subMap = new Map<string, string>();
        const yearMap = new Map<string, string>();
        for (const s of subjects) {
          const sid = String(s.subject_id ?? s.subjectId ?? "");
          const sname = String(s.subject_name ?? s.subjectName ?? sid);
          const scode = String(s.subject_code ?? s.subjectCode ?? "");
          if (sid && !subMap.has(sid)) {
            subMap.set(sid, scode ? `${sname} (${scode})` : sname);
          }
          const yid = String(s.academic_year_id ?? s.academicYearId ?? "");
          const yname = String(
            s.academic_year_name ?? s.academicYear ?? yid
          );
          if (yid && !yearMap.has(yid)) yearMap.set(yid, yname);
        }
        setSubjectOptions(
          [...subMap].map(([id, label]) => ({ id, label }))
        );
        setYearOptions([...yearMap].map(([id, label]) => ({ id, label })));
        if (subMap.size === 0 && roleName === "faculty") {
          setScopeNote("No teaching assignments loaded — use IDs below.");
        }
      } catch {
        if (!cancelled) setScopeNote("Could not load academic context.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canCreate, roleName]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/syllabi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: form.subjectId,
          academicYearId: form.academicYearId,
          title: form.title,
          description: form.description,
          sourceType: form.sourceType,
          sourceReference: form.sourceReference || null,
          sourceNotes: form.sourceNotes || null,
        }),
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
        sourceReference: "",
        sourceNotes: "",
      }));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(item: SyllabusItem) {
    setSelected(item);
    setUnits([]);
    setTopicsByUnit({});
    setVersions([]);
    setBusy(true);
    setError(null);
    try {
      const [uRes, vRes] = await Promise.all([
        fetch(`/api/syllabi/${item.id}/units`, { cache: "no-store" }),
        fetch(`/api/syllabi/${item.id}/versions`, { cache: "no-store" }),
      ]);
      if (uRes.ok) {
        const data = await uRes.json();
        setUnits(data.units ?? []);
      }
      if (vRes.ok) {
        const data = await vRes.json();
        setVersions(data.versions ?? []);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onStatus(id: string, status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/syllabi/${id}`, {
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
      if (selected?.id === id) {
        const updated = { ...selected, status };
        setSelected(updated);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onAddUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/syllabi/${selected.id}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: unitForm.title,
          description: unitForm.description,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || `Unit failed (${res.status})`);
        return;
      }
      setUnitForm({ title: "", description: "" });
      await openDetail(selected);
    } finally {
      setBusy(false);
    }
  }

  async function onAddTopic(unitId: string) {
    if (!selected) return;
    const title = (topicForm[unitId] || "").trim();
    if (!title) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/syllabus-units/${unitId}/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || `Topic failed (${res.status})`);
        return;
      }
      setTopicForm((f) => ({ ...f, [unitId]: "" }));
      const tRes = await fetch(`/api/syllabus-units/${unitId}/topics`, {
        cache: "no-store",
      });
      if (tRes.ok) {
        const tData = await tRes.json();
        setTopicsByUnit((m) => ({ ...m, [unitId]: tData.topics ?? [] }));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <p className="auth-error">{error}</p>}

      {canCreate && (
        <form
          className="coming-soon-panel"
          style={{ marginBottom: 24 }}
          onSubmit={onCreate}
        >
          <p className="panel-label">Create syllabus</p>
          <h2>New syllabus draft</h2>
          {scopeNote && <p className="muted-copy">{scopeNote}</p>}
          <div className="auth-form">
            {subjectOptions.length > 0 ? (
              <>
                <label className="auth-field">
                  <span>Subject</span>
                  <select
                    required
                    value={form.subjectId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, subjectId: e.target.value }))
                    }
                  >
                    <option value="" disabled>
                      Select subject
                    </option>
                    {subjectOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="auth-field">
                  <span>Academic year</span>
                  <select
                    required
                    value={form.academicYearId}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        academicYearId: e.target.value,
                      }))
                    }
                  >
                    <option value="" disabled>
                      Select year
                    </option>
                    {yearOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
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
                <label className="auth-field">
                  <span>Academic year ID</span>
                  <input
                    required
                    value={form.academicYearId}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        academicYearId: e.target.value,
                      }))
                    }
                    placeholder="uuid"
                  />
                </label>
              </>
            )}

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
            <label className="auth-field">
              <span>Source type</span>
              <select
                value={form.sourceType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sourceType: e.target.value }))
                }
              >
                <option value="faculty_prepared">Faculty prepared</option>
                <option value="institution_supplied">Institution supplied</option>
                <option value="imported">Imported</option>
                <option value="unverified">Unverified</option>
              </select>
            </label>
            <label className="auth-field">
              <span>Source reference (optional)</span>
              <input
                value={form.sourceReference}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sourceReference: e.target.value }))
                }
                placeholder="Citation / internal note only"
              />
            </label>
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Create syllabus"}
            </button>
          </div>
        </form>
      )}

      <div className="activity-panel" style={{ marginBottom: 24 }}>
        <p className="card-label">Syllabi ({syllabi.length})</p>
        {syllabi.length === 0 ? (
          <p className="muted-copy" style={{ padding: "16px 0" }}>
            No syllabi in your academic context yet.
          </p>
        ) : (
          <div className="activity-list">
            {syllabi.map((s) => (
              <div className="activity-item" key={s.id}>
                <span className="activity-marker marker-blue" />
                <div>
                  <strong>
                    {s.title} <span className="status-pill">{s.status}</span>{" "}
                    <span className="muted-copy">v{s.version}</span>
                  </strong>
                  <small>
                    {s.subjectName} ({s.subjectCode}) · {s.academicYear} ·{" "}
                    {s.unitCount} units · source: {s.sourceType}
                    {s.sourceIsOfficial ? " · official" : ""}
                    {s.sourceReference ? ` · ${s.sourceReference}` : ""}
                  </small>
                  <small>by {s.creatorName}</small>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => openDetail(s)}
                    disabled={busy}
                  >
                    Open
                  </button>
                  {s.isOwner &&
                    STATUS_ACTIONS.filter((a) => a.from === s.status).map(
                      (a) => (
                        <button
                          key={a.to}
                          type="button"
                          className="quiet-button"
                          disabled={busy}
                          onClick={() => onStatus(s.id, a.to)}
                        >
                          {a.label}
                        </button>
                      )
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="activity-panel" style={{ marginBottom: 24 }}>
          <p className="card-label">
            {selected.title} — units &amp; versions
          </p>
          {units.length === 0 ? (
            <p className="muted-copy">No units yet.</p>
          ) : (
            <ul style={{ paddingLeft: 18 }}>
              {units.map((u) => (
                <li key={u.id} style={{ marginBottom: 12 }}>
                  <strong>
                    Unit {u.unitNumber}: {u.title}
                  </strong>
                  {u.description && (
                    <div className="muted-copy">{u.description}</div>
                  )}
                  <ul style={{ marginTop: 6 }}>
                    {(topicsByUnit[u.id] ?? []).map((t) => (
                      <li key={t.id}>
                        Topic {t.topicNumber}: {t.title}
                      </li>
                    ))}
                  </ul>
                  {selected.isOwner &&
                    selected.status !== "published" &&
                    selected.status !== "archived" && (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          marginTop: 6,
                        }}
                      >
                        <input
                          value={topicForm[u.id] ?? ""}
                          onChange={(e) =>
                            setTopicForm((f) => ({
                              ...f,
                              [u.id]: e.target.value,
                            }))
                          }
                          placeholder="New topic title"
                        />
                        <button
                          type="button"
                          className="quiet-button"
                          disabled={busy}
                          onClick={() => onAddTopic(u.id)}
                        >
                          Add topic
                        </button>
                      </div>
                    )}
                </li>
              ))}
            </ul>
          )}

          {selected.isOwner &&
            selected.status !== "published" &&
            selected.status !== "archived" && (
              <form
                className="auth-form"
                onSubmit={onAddUnit}
                style={{ marginTop: 12 }}
              >
                <label className="auth-field">
                  <span>Unit title</span>
                  <input
                    required
                    value={unitForm.title}
                    onChange={(e) =>
                      setUnitForm((f) => ({ ...f, title: e.target.value }))
                    }
                  />
                </label>
                <button className="auth-submit" type="submit" disabled={busy}>
                  Add unit
                </button>
              </form>
            )}

          <p className="card-label" style={{ marginTop: 16 }}>
            Version history ({versions.length})
          </p>
          <ul style={{ paddingLeft: 18 }}>
            {versions.map((v) => (
              <li key={v.id}>
                v{v.version} · {v.status}
                {v.changeNote ? ` · ${v.changeNote}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="muted-copy">
        Signed in as {roleName}. Official university syllabus content is never
        invented — source fields record provenance only.
      </p>
    </div>
  );
}
