import { getAuthContext } from "@/lib/authz";
import { loadInstitutionWorkspace } from "@/lib/institution-config";

const ENTITIES = [
  { key: "students", label: "Students" },
  { key: "faculty", label: "Faculty" },
  { key: "departments", label: "Departments" },
  { key: "programs", label: "Programs" },
  { key: "subjects", label: "Subjects" },
  { key: "sections", label: "Sections" },
  { key: "structure", label: "Academic structure" },
];

export default async function InstitutionImportPage() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return (
      <div className="placeholder-page">
        <h1>Sign in required</h1>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  let data;
  try {
    data = await loadInstitutionWorkspace(ctx);
  } catch {
    return (
      <div className="placeholder-page">
        <p className="eyebrow">Institution workspace</p>
        <h1>Not available for your role</h1>
      </div>
    );
  }

  if (!data.scope.canImport) {
    return (
      <div className="placeholder-page">
        <p className="eyebrow">Institution workspace</p>
        <h1>Import center</h1>
        <p>Import is limited to institution administrators.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Import center</p>
          <h1>Import foundation</h1>
          <p className="welcome-copy">
            UI contract only — no production writes from this screen yet.
            Unvalidated data must never reach live tables.
          </p>
        </div>
      </section>

      <section className="dash-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">pipeline</p>
            <h2>Upload → Validate → Preview → Approve → Import → Audit</h2>
          </div>
        </div>

        <ol className="inst-onboarding-steps">
          {["Upload CSV/Excel", "Validate columns & rows", "Preview changes", "Approve", "Import", "Audit log"].map(
            (label, i) => (
              <li className="inst-step inst-step-todo" key={label}>
                <span className="inst-step-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span>{label}</span>
              </li>
            )
          )}
        </ol>

        <div className="inst-toggle-grid">
          {ENTITIES.map((e) => (
            <div className="inst-card" key={e.key}>
              <h3>{e.label}</h3>
              <p className="placement-muted">
                Contract ready · engine deferred (no large spreadsheet runtime
                in M11).
              </p>
              <button className="quiet-button" type="button" disabled>
                Upload (coming later)
              </button>
            </div>
          ))}
        </div>

        <p className="placement-muted">
          Documented limitation: file parsing, column mapping, and bulk insert
          are intentionally not implemented — foundation and contract only.
        </p>
      </section>
    </div>
  );
}
