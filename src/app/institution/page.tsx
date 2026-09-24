import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import { loadInstitutionWorkspace } from "@/lib/institution-config";

/**
 * Institution Control Center hub (Milestone 11).
 * Role-aware: admin (configure), Director/Dean (approve + read),
 * system_admin (technical read). Client nav is UX only.
 */
export default async function InstitutionPage() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Institution workspace</p>
            <h1>Sign in to open Institution Control Center</h1>
            <p className="page-description">
              Profile, branding, modules, and institution settings live inside
              your authorized institutional scope.
            </p>
          </div>
        </div>
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
        <div className="page-heading">
          <div>
            <p className="eyebrow">Institution workspace</p>
            <h1>Institution access</h1>
            <p className="page-description">
              This control center is limited to institution admin, Director/Dean,
              and system administration.
            </p>
          </div>
        </div>
        <section className="coming-soon-panel">
          <div className="panel-line" />
          <p className="panel-label">Access</p>
          <h2>Not available for your role</h2>
          <p>
            Students, faculty, HOD, TPO, and recruiters do not receive
            institution configuration powers.
          </p>
          <Link className="text-link" href="/">
            Back to dashboard <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </div>
    );
  }

  const { scope, institution, config, moduleCount, pendingChangeCount, onboardingPercent } = data;
  const canConfigure = scope.canConfigure;

  const cards = [
    {
      title: "Profile & contact",
      href: "/institution/profile",
      desc: "Name, about, address, contacts, social links.",
      show: true,
    },
    {
      title: "Branding",
      href: "/institution/branding",
      desc: "Logo, colors, taglines, favicon (white-label foundation).",
      show: true,
    },
    {
      title: "Public page",
      href: "/institution/public",
      desc: "Choose which fields appear on the public directory page.",
      show: canConfigure,
    },
    {
      title: "Academic structure",
      href: "/institution/structure",
      desc: "Universities, departments, programs, years, sections.",
      show: true,
    },
    {
      title: "Users & roles",
      href: "/institution/users",
      desc: "People in this institution and their roles.",
      show: true,
    },
    {
      title: "Account lifecycle",
      href: "/institution/accounts",
      desc: "Suspend, graduate, or mark accounts inactive — audited.",
      show: canConfigure || scope.canApprove,
    },
    {
      title: "Modules & features",
      href: "/institution/modules",
      desc: `${moduleCount} modules configured for this institution.`,
      show: canConfigure || scope.canApprove,
    },
    {
      title: "Onboarding",
      href: "/institution/onboarding",
      desc: `${onboardingPercent}% complete · ${config.onboarding_status}`,
      show: canConfigure,
    },
    {
      title: "Config changes",
      href: "/institution/changes",
      desc: `${pendingChangeCount} pending review or publish.`,
      show: canConfigure || scope.canApprove,
    },
    {
      title: "Audit history",
      href: "/institution/audit",
      desc: "Who changed what, and when.",
      show: scope.canViewAudit,
    },
    {
      title: "Import & export",
      href: "/institution/import",
      desc: "CSV import with approval + controlled audited export.",
      show: scope.canImport || scope.canApprove || scope.roleName === "hod" || scope.roleName === "tpo",
    },
    {
      title: "Privacy notices",
      href: "/institution/settings",
      desc: "Privacy, data-handling, AI notice, and terms wording.",
      show: canConfigure,
    },
    {
      title: "Documents & notifications",
      href: "/institution/settings",
      desc: "Document rules, notification defaults, security placeholders.",
      show: canConfigure,
    },
  ].filter((c) => c.show);

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution workspace</p>
          <h1>Institution Control Center</h1>
          <p className="welcome-copy">
            {canConfigure
              ? "Configure profile, branding, modules, and people for your institution."
              : scope.canApprove
                ? "Review and approve sensitive configuration changes for your institution."
                : "Technical read-only view of institution configuration."}
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span>◎</span>
        </div>
      </section>

      <section className="overview-grid dash-stats" aria-label="Overview">
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-teal" aria-hidden="true">
            ▣
          </span>
          <strong>{institution.name}</strong>
          <span>Institution · {institution.slug}</span>
        </div>
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-blue" aria-hidden="true">
            ◇
          </span>
          <strong>{onboardingPercent}%</strong>
          <span>Onboarding · {config.onboarding_status}</span>
        </div>
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-purple" aria-hidden="true">
            ⬡
          </span>
          <strong>{moduleCount}</strong>
          <span>Module flags</span>
        </div>
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-orange" aria-hidden="true">
            ◷
          </span>
          <strong>{pendingChangeCount}</strong>
          <span>Pending changes</span>
        </div>
      </section>

      <section className="dash-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Areas</p>
            <h2>Configuration</h2>
          </div>
        </div>
        <div className="inst-card-grid">
          {cards.map((card) => (
            <Link className="inst-card" href={card.href} key={card.href}>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
              <span className="text-link">
                Open <span aria-hidden="true">↗</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="dash-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Role boundary</p>
            <h2>Who can do what</h2>
          </div>
        </div>
        <ul className="inst-boundary-list">
          <li>
            <strong>Institution admin</strong> — configure own institution
            (profile, branding, modules); create config changes.
          </li>
          <li>
            <strong>Director / Dean</strong> — approve or reject sensitive
            config changes; full read. Not Platform Owner.
          </li>
          <li>
            <strong>System admin</strong> — technical read only; no
            institutional config write power.
          </li>
          <li>
            <strong>Platform Owner</strong> — platform-level role (not yet
            provisioned; documented for later milestones).
          </li>
        </ul>
        <p className="placement-muted">
          Server-side authorization is authoritative. Campus Skill platform
          identity remains distinguishable from institution branding.
        </p>
      </section>
    </div>
  );
}
