import { getAuthContext } from "@/lib/authz";
import { loadInstitutionWorkspace } from "@/lib/institution-config";
import { InstitutionConfigForm } from "@/components/institution/config-form";

export default async function InstitutionBrandingPage() {
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

  const { config, scope, institution } = data;
  const readOnly = !scope.canConfigure;

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Branding</p>
          <h1>White-label foundation</h1>
          <p className="welcome-copy">
            Institution logo, colors, and taglines. Campus Skill platform
            identity remains distinguishable — no full visual redesign.
          </p>
        </div>
      </section>

      <InstitutionConfigForm
        area="branding"
        title="Branding"
        description="Applied to login, dashboard chrome, and public page accents via CSS variables."
        readOnly={readOnly}
        initial={{
          primaryColor: config.primary_color,
          secondaryColor: config.secondary_color,
          faviconUrl: config.favicon_url,
          loginTagline: config.login_tagline,
          dashboardTagline: config.dashboard_tagline,
        }}
        fields={[
          { key: "primaryColor", label: "Primary color", type: "color" },
          { key: "secondaryColor", label: "Secondary color", type: "color" },
          { key: "faviconUrl", label: "Favicon URL", type: "url", maxLength: 500 },
          { key: "loginTagline", label: "Login tagline", maxLength: 200 },
          { key: "dashboardTagline", label: "Dashboard tagline", maxLength: 200 },
        ]}
      />

      <div className="dash-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">preview</p>
            <h2>Current identity</h2>
          </div>
        </div>
        <div className="inst-brand-preview">
          <div
            className="inst-brand-swatch"
            style={{
              background: config.primary_color || "var(--brand-primary, #0f766e)",
            }}
          />
          <div
            className="inst-brand-swatch"
            style={{
              background: config.secondary_color || "var(--brand-secondary, #115e59)",
            }}
          />
          <div>
            <strong>{institution.name}</strong>
            <p>{config.login_tagline || "Campus Skill platform"}</p>
            <p className="placement-muted">
              In scope later: theme deployment automation, multi-campus,
              billing — not in M11.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
