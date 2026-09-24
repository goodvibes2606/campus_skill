import { getAuthContext } from "@/lib/authz";
import { loadInstitutionWorkspace } from "@/lib/institution-config";
import { InstitutionConfigForm } from "@/components/institution/config-form";

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

  const readOnly = !data.scope.canConfigure;
  const c = data.config as Record<string, unknown>;

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
      body: "Letterhead, certificate, and document templates for exports. Full document engine deferred.",
      status: "Placeholder",
    },
    {
      title: "Security",
      body: "Password reset + email verification foundation enabled (M12). MFA, IP allowlists, and advanced session policy remain future work.",
      status: "Partial",
    },
    {
      title: "Integrations",
      body: "LMS, email SMTP, SSO, payment providers — out of current scope. Optional AUTH_MAIL_WEBHOOK_URL only.",
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
          <h1>Privacy, notices &amp; advanced</h1>
          <p className="welcome-copy">
            Configure privacy wording users acknowledge on their Profile. Other
            panels keep documented limitations — no fake fully-workflowed
            features.
          </p>
        </div>
      </section>

      <InstitutionConfigForm
        area="privacy"
        title="Privacy & AI notices"
        description="Wording shown on Profile → Privacy. Leave blank to use platform defaults. Not legal advice — your institution owns the text."
        readOnly={readOnly}
        initial={{
          privacyNotice: c.privacy_notice ?? "",
          dataHandlingNotice: c.data_handling_notice ?? "",
          aiNotice: c.ai_notice ?? "",
          termsAckText: c.terms_ack_text ?? "",
        }}
        fields={[
          {
            key: "privacyNotice",
            label: "Privacy notice",
            type: "textarea",
            maxLength: 8000,
            placeholder: "How personal and academic data is used…",
          },
          {
            key: "dataHandlingNotice",
            label: "Data handling notice",
            type: "textarea",
            maxLength: 8000,
            placeholder: "Access, export, and retention summary…",
          },
          {
            key: "aiNotice",
            label: "AI notice",
            type: "textarea",
            maxLength: 8000,
            placeholder: "What AI Assist may send to a provider…",
          },
          {
            key: "termsAckText",
            label: "Terms acknowledgement",
            type: "textarea",
            maxLength: 8000,
            placeholder: "Acceptable use summary…",
          },
        ]}
      />

      <div className="inst-card-grid" style={{ marginTop: 24 }}>
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
