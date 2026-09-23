import { getAuthContext } from "@/lib/authz";
import { loadInstitutionWorkspace } from "@/lib/institution-config";
import { loadInstitutionStructure } from "@/lib/institution-directory";

export default async function InstitutionStructurePage() {
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

  try {
    await loadInstitutionWorkspace(ctx);
  } catch {
    return (
      <div className="placeholder-page">
        <p className="eyebrow">Institution workspace</p>
        <h1>Not available for your role</h1>
      </div>
    );
  }

  const structure = await loadInstitutionStructure(ctx);

  const cards = [
    { label: "Universities", value: structure.universities },
    { label: "Departments", value: structure.departments },
    { label: "Programs", value: structure.programs },
    { label: "Academic years", value: structure.academicYears },
    { label: "Semesters", value: structure.semesters },
    { label: "Sections", value: structure.sections },
    { label: "Subjects", value: structure.subjects },
    { label: "Active people", value: structure.activeProfiles },
  ];

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Academic structure</p>
          <h1>Structure overview</h1>
          <p className="welcome-copy">
            Read-only foundation counts from existing hierarchy tables. Creation
            of structure entities stays in dedicated academic flows.
          </p>
        </div>
      </section>

      <section className="overview-grid dash-stats">
        {cards.map((c) => (
          <div className="overview-card stat-card" key={c.label}>
            <strong>{c.value}</strong>
            <span>{c.label}</span>
          </div>
        ))}
      </section>

      <section className="dash-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">roles</p>
            <h2>People by role</h2>
          </div>
        </div>
        {structure.byRole.length === 0 ? (
          <p className="placement-muted">No active profiles yet.</p>
        ) : (
          <ul className="inst-boundary-list">
            {structure.byRole.map((r) => (
              <li key={r.role_name}>
                <strong>{r.role_name}</strong> — {r.count}
              </li>
            ))}
          </ul>
        )}
        <p className="placement-muted">
          Documented limitation: full role-mutation UI is deferred; role
          catalog remains server-controlled.
        </p>
      </section>
    </div>
  );
}
