import { getAuthContext } from "@/lib/authz";
import { loadInstitutionWorkspace } from "@/lib/institution-config";

export default async function InstitutionSettingsPage() {
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

  const panels = [
    {
      title: "Academic calendar",
      body: "Institution-level term dates and holidays. Detailed calendar events already live under Calendar.",
      status: "Foundation reference",
    },
    {
      title: "Notification defaults",
      body: "In-app notification model exists (M5). Per-institution channel defaults and templates are a later configuration pass.",
      status: "Partial",
    },
    {
      title: "Documents & templates",
      body: "Letterhead, certificate, and document templates for exports. Storage/CDN is TBD — not configured in M11.",
      status: "Placeholder",
    },
    {
      title: "Security",
      body: "Session policy, MFA, password rules, IP allowlists. Better Auth owns sessions; institution-specific policy hooks come later.",
      status: "Placeholder",
    },
    {
      title: "Integrations",
      body: "LMS, email SMTP, SSO, payment providers — explicitly out of M11 scope.",
      status: "Out of scope",
    },
    {
      title: "Advanced settings",
      body: "Multi-campus, branding deployment automation, billing — deferred list from product spec.",
      status: "Out of scope",
    },
  ];

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Settings</p>
          <h1>Documents, notifications &amp; advanced</h1>
          <p className="welcome-copy">
            Safe foundation panels with documented limitations — no fake
            fully-workflowed features.
          </p>
        </div>
      </section>

      <div className="inst-card-grid">
        {panels.map((p) => (
          <div className="inst-card" key={p.title}>
            <p className="eyebrow">{p.status}</p>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
