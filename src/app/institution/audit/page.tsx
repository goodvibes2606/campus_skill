import { getAuthContext } from "@/lib/authz";
import { listConfigAudit } from "@/lib/institution-config";
import { getInstitutionWorkspaceScope, assertCanReadInstitutionWorkspace } from "@/lib/institution-scope";

export default async function InstitutionAuditPage() {
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
    const scope = await getInstitutionWorkspaceScope(ctx);
    assertCanReadInstitutionWorkspace(scope);
    if (!scope.canViewAudit) {
      throw new Error("denied");
    }
  } catch {
    return (
      <div className="placeholder-page">
        <p className="eyebrow">Institution workspace</p>
        <h1>Audit not available</h1>
        <p>Limited to institution admin, Director/Dean, and system administration.</p>
      </div>
    );
  }

  const rows = await listConfigAudit(ctx, 100);

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Audit</p>
          <h1>Configuration history</h1>
          <p className="welcome-copy">
            Who changed what, and when. Values are clipped snapshots — no
            secrets or passwords stored.
          </p>
        </div>
      </section>

      <section className="dash-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">audit</p>
            <h2>{rows.length} events</h2>
          </div>
        </div>
        <div className="inst-table-wrap">
          <table className="inst-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Area</th>
                <th>Action</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>{r.changed_by_name}</td>
                  <td>{r.area}</td>
                  <td>{r.action}</td>
                  <td>{r.status || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="placement-muted">No configuration events yet.</p>
        ) : null}
      </section>
    </div>
  );
}
