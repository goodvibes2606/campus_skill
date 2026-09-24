import { getAuthContext } from "@/lib/authz";
import { loadInstitutionWorkspace } from "@/lib/institution-config";
import { ImportCenter } from "@/components/import-export/import-center";
import { ExportCenter } from "@/components/import-export/export-center";

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

  if (!data.scope.canImport && data.scope.roleName !== "director_dean") {
    return (
      <div className="placeholder-page">
        <p className="eyebrow">Institution workspace</p>
        <h1>Import center</h1>
        <p>Import is limited to institution administrators and Director/Dean.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Import &amp; export</p>
          <h1>Data movement</h1>
          <p className="welcome-copy">
            CSV import with validate → approve → run, and allow-listed exports.
            Every job is audited. No unrestricted database dumps.
          </p>
        </div>
      </section>

      <ImportCenter />

      <section className="content-section">
        <ExportCenter />
      </section>

      <section className="content-section">
        <p className="placement-muted">
            Supported import entities: {ENTITIES.map((e) => e.label).join(", ")}.
            Accepts pasted CSV or .xlsx workbooks. Student/faculty imports
            never set passwords.
        </p>
      </section>
    </div>
  );
}
