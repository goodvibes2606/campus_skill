import { getAuthContext } from "@/lib/authz";
import { loadInstitutionWorkspace } from "@/lib/institution-config";
import { OnboardingPanel } from "@/components/institution/onboarding-panel";

export default async function InstitutionOnboardingPage() {
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

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Onboarding</p>
          <h1>Onboarding progress</h1>
          <p className="welcome-copy">
            Identity → Contact → Structure → People → Rules → Communication →
            Branding → Review → Publish.
          </p>
        </div>
      </section>

      <OnboardingPanel
        canEdit={data.scope.canConfigure}
        status={data.config.onboarding_status}
        step={data.config.onboarding_step}
        percent={data.onboardingPercent}
      />
    </div>
  );
}
