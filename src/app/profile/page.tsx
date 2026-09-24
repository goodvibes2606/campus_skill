import { getAuthContext } from "@/lib/authz";
import { getProfileById } from "@/lib/profile";
import { getConsentStatuses, type ConsentStatus } from "@/lib/privacy";
import { ConsentPanel } from "@/components/privacy/consent-panel";

export const metadata = {
  title: "Profile | Campus Skill",
};

export default async function ProfilePage() {
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

  const profile = await getProfileById(ctx.userId);
  let statuses: ConsentStatus[] = [];
  let hasNotices = false;
  try {
    const consent = await getConsentStatuses(ctx);
    statuses = consent.statuses;
    hasNotices = true;
  } catch {
    hasNotices = false;
  }

  const roleLabel = ctx.roleName.replace(/_/g, " ");

  return (
    <div className="dashboard-page profile-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Your academic identity</p>
          <h1>Profile</h1>
          <p className="welcome-copy">
            Account details, status, and privacy acknowledgements for your
            institution workspace.
          </p>
        </div>
        <div className="placeholder-seal" aria-hidden="true">
          {(ctx.fullName || ctx.email || "?").slice(0, 2).toUpperCase()}
        </div>
      </section>

      <div className="inst-card-grid">
        <div className="inst-card">
          <p className="eyebrow">identity</p>
          <h3>{ctx.fullName || "—"}</h3>
          <p>{ctx.email}</p>
          <p className="placement-muted">User ID: {ctx.userId}</p>
        </div>
        <div className="inst-card">
          <p className="eyebrow">role &amp; scope</p>
          <h3 style={{ textTransform: "capitalize" }}>{roleLabel}</h3>
          <p>
            Institution:{" "}
            {ctx.institutionId
              ? ctx.institutionId.slice(0, 8) + "…"
              : "Not assigned"}
          </p>
          <p className="placement-muted">
            Workspace access requires an active profile status.
          </p>
        </div>
        <div className="inst-card">
          <p className="eyebrow">account status</p>
          <h3 style={{ textTransform: "capitalize" }}>{profile?.status ?? ctx.profileStatus}</h3>
          <p className="placement-muted">
            Suspended, inactive, graduated, left, or deactivated accounts
            cannot use the workspace. Your admin can change lifecycle status.
          </p>
        </div>
      </div>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">account</p>
            <h2>Security &amp; recovery</h2>
          </div>
        </div>
        <div className="help-module-chips" style={{ marginTop: 12 }}>
          <a className="ai-chip" href="/forgot-password">
            Reset password
          </a>
          <a className="ai-chip" href="/verify-email">
            Verify email
          </a>
          <a className="ai-chip" href="/help?id=acc-recover">
            Password help
          </a>
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">privacy</p>
            <h2>Notices &amp; consent</h2>
          </div>
        </div>
        {hasNotices ? (
          <ConsentPanel initial={statuses} />
        ) : (
          <p className="empty-state">
            Privacy notices are not available right now. Try again later.
          </p>
        )}
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">help</p>
            <h2>Need guidance?</h2>
          </div>
        </div>
        <p className="placement-muted" style={{ marginTop: 8 }}>
          Open{" "}
          <a className="text-link" href="/help">
            Campus Skill Help
          </a>{" "}
          for role-aware articles on your modules.
        </p>
      </section>
    </div>
  );
}
