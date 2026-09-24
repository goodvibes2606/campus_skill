"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useState } from "react";

type JobView = {
  id: string;
  entityType: string;
  status: string;
  originalFilename: string | null;
  totalRows: number;
  validRows: number;
  errorRows: number;
  importedRows: number;
  validationSummary?: {
    errorSample?: { row: number; errors: string[] }[];
  };
  createdAt?: string;
};

const ENTITIES = [
  { key: "departments", label: "Departments", hint: "name, code" },
  { key: "programs", label: "Programs", hint: "name, code, department_code" },
  { key: "subjects", label: "Subjects (validate only)", hint: "name, code" },
  { key: "sections", label: "Sections (validate only)", hint: "name, program_code" },
  { key: "students", label: "Students (queue, no password)", hint: "email, full_name" },
  { key: "faculty", label: "Faculty (queue, no password)", hint: "email, full_name" },
  { key: "structure", label: "Structure (validate only)", hint: "name, code" },
];

export function ImportCenter() {
  const router = useRouter();
  const [entityType, setEntityType] = useState("departments");
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("upload.csv");
  const [xlsxBase64, setXlsxBase64] = useState<string | null>(null);
  const [xlsxFilename, setXlsxFilename] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [selected, setSelected] = useState<{
    job: JobView;
    preview?: { rowNumber: number; status: string; errors: string[] }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadJobs() {
    try {
      const res = await fetch("/api/import?limit=30");
      const json = await res.json();
      if (res.ok) setJobs(json.jobs ?? []);
    } catch {
      /* ignore */
    }
  }

  async function handleFilePick(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = event.target.files?.[0];
    if (!file) {
      setXlsxBase64(null);
      setXlsxFilename(null);
      return;
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm")) {
      setError("Please choose an .xlsx workbook (or paste CSV below).");
      event.target.value = "";
      return;
    }
    if (file.size > 4_000_000) {
      setError("Workbook too large (max ~4MB).");
      event.target.value = "";
      return;
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    setXlsxBase64(btoa(binary));
    setXlsxFilename(file.name);
    setFilename(file.name);
    setCsvText("");
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const payload: Record<string, string> = { entityType, filename };
      if (xlsxBase64) {
        payload.xlsxBase64 = xlsxBase64;
        payload.format = "xlsx";
        payload.filename = xlsxFilename || filename;
      } else {
        payload.csvText = csvText;
      }
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Import failed validation.");
        return;
      }
      setMessage(
        `Validated job ${json.job.id}: ${json.job.validRows} valid, ${json.job.errorRows} errors.`
      );
      setSelected({
        job: {
          ...json.job,
          originalFilename: payload.filename,
          importedRows: 0,
        },
        preview: json.preview,
      });
      setCsvText("");
      setXlsxBase64(null);
      setXlsxFilename(null);
      await loadJobs();
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function action(id: string, act: "approve" | "run") {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/import/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || `Unable to ${act}.`);
        return;
      }
      setMessage(
        act === "approve"
          ? "Job approved — ready to run."
          : `Import complete: ${json.imported} imported, ${json.skipped} skipped.`
      );
      await loadJobs();
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="dash-panel" style={{ marginBottom: 16 }}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">upload</p>
            <h2>Upload CSV or Excel</h2>
          </div>
          <button className="quiet-button" type="button" onClick={loadJobs}>
            Refresh jobs
          </button>
        </div>
        <p className="placement-muted" style={{ margin: "8px 0 12px" }}>
          Paste CSV or pick an .xlsx workbook. Pipeline: Upload → Validate →
          Preview → Approve → Import → Audit. Nothing writes to live tables
          before approve + run.
        </p>
        <form className="placement-form" onSubmit={handleUpload}>
          <div className="placement-field-row">
            <label className="placement-field">
              <span>Entity</span>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
              >
                {ENTITIES.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="placement-field">
              <span>Filename</span>
              <input
                value={filename}
                onChange={(e) => {
                  setFilename(e.target.value);
                  if (xlsxBase64) {
                    setXlsxBase64(null);
                    setXlsxFilename(null);
                  }
                }}
                placeholder="departments.csv or departments.xlsx"
              />
            </label>
          </div>
          <label className="placement-field">
            <span>Excel workbook (.xlsx)</span>
            <input
              type="file"
              accept=".xlsx,.xlsm"
              onChange={handleFilePick}
            />
          </label>
          {xlsxBase64 && (
            <p className="placement-success" role="status">
              Loaded {xlsxFilename} — CSV paste ignored while a workbook is
              attached.
            </p>
          )}
          <p className="placement-muted">
            Expected columns:{" "}
            {ENTITIES.find((e) => e.key === entityType)?.hint}
          </p>
          <label className="placement-field">
            <span>CSV content{xlsxBase64 ? " (unused while workbook attached)" : ""}</span>
            <textarea
              rows={8}
              required={!xlsxBase64}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={"name,code\nScience,SCI"}
              disabled={Boolean(xlsxBase64)}
            />
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="placement-success" role="status">
              {message}
            </p>
          )}
          <div>
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Working…" : "Upload & validate"}
            </button>
          </div>
        </form>
      </section>

      {selected && (
        <section className="dash-panel" style={{ marginBottom: 16 }}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">preview</p>
              <h2>
                {selected.job.entityType} · {selected.job.status}
              </h2>
            </div>
            <div className="inst-change-actions">
              <button
                className="auth-submit"
                type="button"
                style={{ padding: "8px 12px", fontSize: 11 }}
                disabled={
                  busy ||
                  !["validated", "previewed"].includes(selected.job.status)
                }
                onClick={() => action(selected.job.id, "approve")}
              >
                Approve
              </button>
              <button
                className="auth-submit"
                type="button"
                style={{ padding: "8px 12px", fontSize: 11 }}
                disabled={busy || selected.job.status !== "approved"}
                onClick={() => action(selected.job.id, "run")}
              >
                Run import
              </button>
            </div>
          </div>
          <p className="placement-muted">
            Job {selected.job.id} · {selected.job.validRows} valid /{" "}
            {selected.job.totalRows} total · {selected.job.errorRows} errors
          </p>
          {selected.preview && selected.preview.length > 0 && (
            <div className="inst-table-wrap">
              <table className="inst-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Status</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.preview.slice(0, 50).map((r) => (
                    <tr key={r.rowNumber}>
                      <td>{r.rowNumber}</td>
                      <td>{r.status}</td>
                      <td>{r.errors.join("; ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="dash-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">jobs</p>
            <h2>Recent import jobs</h2>
          </div>
        </div>
        {jobs.length === 0 ? (
          <p className="empty-state">No import jobs yet.</p>
        ) : (
          <div className="inst-table-wrap">
            <table className="inst-table">
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Status</th>
                  <th>Rows</th>
                  <th>Imported</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.entityType}</td>
                    <td>
                      <span className="status-pill">{j.status}</span>
                    </td>
                    <td>
                      {j.validRows}/{j.totalRows}
                    </td>
                    <td>{j.importedRows}</td>
                    <td>{j.originalFilename || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
