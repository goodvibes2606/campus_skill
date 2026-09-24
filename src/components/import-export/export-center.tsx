"use client";

import { useState } from "react";

type ExportEntity =
  | "students"
  | "faculty"
  | "departments"
  | "programs"
  | "subjects"
  | "sections"
  | "enrollments"
  | "assignments"
  | "announcements";

const ENTITIES: { key: ExportEntity; label: string }[] = [
  { key: "students", label: "Students" },
  { key: "faculty", label: "Faculty & staff" },
  { key: "departments", label: "Departments" },
  { key: "programs", label: "Programs" },
  { key: "subjects", label: "Subjects" },
  { key: "sections", label: "Sections" },
  { key: "enrollments", label: "Enrollments" },
  { key: "assignments", label: "Assignments" },
  { key: "announcements", label: "Announcements" },
];

export function ExportCenter() {
  const [entity, setEntity] = useState<ExportEntity>("students");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastCsv, setLastCsv] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<string | null>(null);

  async function runExport() {
    setError(null);
    setMessage(null);
    setLastCsv(null);
    setBusy(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity, format }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Export denied or failed.");
        return;
      }
      setMessage(
        `Export complete: ${json.rowCount} rows (job ${json.jobId}).`
      );
      setLastMeta(`${json.entity}.${format}`);
      if (format === "csv" && typeof json.csv === "string") {
        setLastCsv(json.csv);
      } else if (format === "json") {
        setLastCsv(JSON.stringify(json.data, null, 2));
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!lastCsv) return;
    const blob = new Blob([lastCsv], {
      type: format === "csv" ? "text/csv" : "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = lastMeta || `export.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="dash-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">export</p>
          <h2>Controlled export</h2>
        </div>
      </div>
      <p className="placement-muted" style={{ margin: "8px 0 12px" }}>
        Allow-listed entities only. Every run is audited. TPO cannot export
        enrollments or assignments. No unrestricted dumps.
      </p>
      <div className="placement-field-row">
        <label className="placement-field">
          <span>Entity</span>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value as ExportEntity)}
          >
            {ENTITIES.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className="placement-field">
          <span>Format</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "csv" | "json")}
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
      </div>
      {error && (
        <p className="auth-error" role="alert" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
      {message && (
        <p className="placement-success" role="status" style={{ marginTop: 10 }}>
          {message}
        </p>
      )}
      <div className="inst-change-actions" style={{ marginTop: 12 }}>
        <button
          className="auth-submit"
          type="button"
          disabled={busy}
          onClick={runExport}
        >
          {busy ? "Exporting…" : "Run export"}
        </button>
        {lastCsv && (
          <button className="quiet-button" type="button" onClick={download}>
            Download file
          </button>
        )}
      </div>
      {lastCsv && (
        <pre
          className="placement-body"
          style={{
            maxHeight: 220,
            overflow: "auto",
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: 12,
            marginTop: 12,
            fontSize: 11,
          }}
        >
          {lastCsv.slice(0, 4000)}
          {lastCsv.length > 4000 ? "\n…" : ""}
        </pre>
      )}
    </section>
  );
}
