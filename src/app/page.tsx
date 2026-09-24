import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import {
  loadDashboard,
  type DashboardPayload,
  type DashboardSection,
} from "@/lib/dashboard";

function renderSection(s: DashboardSection) {
  return (
    <section className="dash-panel" key={s.key} aria-label={s.title}>
      <div className="section-heading">
        <div>
          {s.eyebrow ? <p className="eyebrow">{s.eyebrow}</p> : null}
          <h2>{s.title}</h2>
        </div>
        {s.moreHref ? (
          <Link className="quiet-button" href={s.moreHref}>
            {s.moreLabel ?? "View all"} →
          </Link>
        ) : (
          <span className="section-note">{s.items.length} item{s.items.length === 1 ? "" : "s"}</span>
        )}
      </div>
      {s.items.length === 0 ? (
        <p className="empty-state">{s.emptyMessage}</p>
      ) : (
        <div className="dash-list">
          {s.items.map((item) => {
            const body = (
              <>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.meta}</small>
                </div>
                {item.badge ? (
                  <span className="status-pill">{item.badge}</span>
                ) : null}
              </>
            );
            return item.href ? (
              <Link className="dash-row" href={item.href} key={`${s.key}-${item.id}`}>
                {body}
                <span className="activity-arrow" aria-hidden="true">
                  ›
                </span>
              </Link>
            ) : (
              <div className="dash-row" key={`${s.key}-${item.id}`}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function renderDashboard(data: DashboardPayload) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const primaryActions = data.quickActions[0]?.actions ?? [];

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">{dateLine}</p>
          <h1>
            {greeting}, {data.displayName.split(/\s+/)[0] || data.displayName}.
          </h1>
          <p className="welcome-copy">{data.contextLine}</p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span>✦</span>
        </div>
      </section>

      <section className="overview-grid dash-stats" aria-label="Overview">
        {data.stats.map((s) => (
          <div className="overview-card stat-card" key={s.label}>
            <span className="stat-icon stat-icon-teal" aria-hidden="true">
              ◎
            </span>
            <strong>{s.value}</strong>
            <span>{s.label}</span>
            {s.hint ? <small>{s.hint}</small> : null}
          </div>
        ))}
      </section>

      {primaryActions.length > 0 ? (
        <section className="content-section" aria-label="Quick access">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Move forward</p>
              <h2>Quick access</h2>
            </div>
            <span className="section-note">Your essentials</span>
          </div>
          <div className="quick-grid">
            {primaryActions.map((a) => (
              <Link
                className={`quick-card quick-card-${a.tone}`}
                href={a.href}
                key={a.title}
              >
                <span className="quick-icon" aria-hidden="true">
                  {a.tone === "gold" ? "✓" : a.tone === "green" ? "✦" : "▤"}
                </span>
                <span>
                  <strong>{a.title}</strong>
                  <small>{a.detail}</small>
                </span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="dash-grid" aria-label="Dashboard panels">
        {data.sections.map(renderSection)}
      </section>
    </div>
  );
}

function renderSignedOut() {
  return (
    <div className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Campus Skill</p>
          <h1>Sign in for your dashboard</h1>
          <p className="page-description">
            Your role-aware academic dashboard appears after you sign in.
            Content is filtered server-side to your authorized scope.
          </p>
        </div>
        <div className="placeholder-seal" aria-hidden="true">
          CS
        </div>
      </div>
      <section className="coming-soon-panel">
        <div className="panel-line" />
        <p className="panel-label">Welcome</p>
        <h2>Learn. Apply. Grow.</h2>
        <p>
          Students, faculty, HODs, directors, and administrators each get a
          dashboard built from real academic data they are allowed to see.
        </p>
        <Link className="sign-in-link" href="/sign-in">
          Sign in
        </Link>
      </section>
    </div>
  );
}

function renderLoadError() {
  return (
    <div className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Could not load your dashboard</h1>
          <p className="page-description">
            Something went wrong while loading authorized data. Nothing was
            changed — try again, or open a section from the navigation.
          </p>
        </div>
      </div>
      <section className="coming-soon-panel" role="alert">
        <div className="panel-line" />
        <p className="panel-label">Error</p>
        <h2>Temporary load failure</h2>
        <p>
          If this continues, sign out and back in, or contact your institution
          administrator.
        </p>
        <Link className="text-link" href="/">
          Retry dashboard <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </div>
  );
}

/**
 * Role-aware home dashboard (Milestone 7).
 * Server component: identity, role, and all list data are resolved
 * server-side via existing authz + visibility-filtered services.
 */
export default async function Home() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return renderSignedOut();
  }

  try {
    const data = await loadDashboard(ctx);
    return renderDashboard(data);
  } catch (error) {
    console.error("dashboard_load_failed", error);
    return renderLoadError();
  }
}
