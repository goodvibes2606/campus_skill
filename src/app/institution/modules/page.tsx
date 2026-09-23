import { getAuthContext } from "@/lib/authz";
import { loadInstitutionWorkspace } from "@/lib/institution-config";
import { listInstitutionModules } from "@/lib/institution-modules";
import { ModuleToggleList } from "@/components/institution/module-toggles";

export default async function InstitutionModulesPage() {
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

  const modules = await listInstitutionModules(ctx);

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Modules</p>
          <h1>Modules &amp; features</h1>
          <p className="welcome-copy">
            {data.institution.name} · server-side checks are authoritative.
          </p>
        </div>
      </section>

      <ModuleToggleList
        canEdit={data.scope.canConfigure}
        modules={modules.map((m) => ({
          moduleKey: m.moduleKey,
          enabled: m.enabled,
          isDefault: m.isDefault,
          updatedAt: m.updatedAt ? m.updatedAt.toISOString() : null,
        }))}
      />
    </div>
  );
}
