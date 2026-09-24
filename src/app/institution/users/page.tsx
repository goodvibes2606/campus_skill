import { getAuthContext } from "@/lib/authz";
import { loadInstitutionWorkspace } from "@/lib/institution-config";
import { listInstitutionUsers } from "@/lib/institution-directory";

export default async function InstitutionUsersPage() {
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

  const users = await listInstitutionUsers(ctx, { limit: 200 });

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Users &amp; roles</p>
          <h1>People</h1>
          <p className="welcome-copy">
            Directory of profiles in this institution. Role assignment UI is a
            documented future RBAC flow — not invented here. For suspend /
            graduate / leave, use{" "}
            <a className="text-link" href="/institution/accounts">
              Account lifecycle
            </a>
            .
          </p>
        </div>
      </section>

      <section className="dash-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">directory</p>
            <h2>{users.length} active directory rows</h2>
          </div>
        </div>
        <div className="inst-table-wrap">
          <table className="inst-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Dept (HOD)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name || "—"}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className="inst-role-chip">{u.role_name}</span>
                  </td>
                  <td>{u.department_name || "—"}</td>
                  <td>{u.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 ? (
          <p className="placement-muted">No users in this institution yet.</p>
        ) : null}
      </section>
    </div>
  );
}
