import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import { getPlacementScope } from "@/lib/placement-scope";
import { loadPlacementCounts } from "@/lib/placement-applications";
import {
  listOpportunities,
} from "@/lib/placement-opportunities";
import {
  listApplications,
} from "@/lib/placement-applications";

/**
 * Placement hub (Milestone 9).
 * Role-aware entry: student career path, TPO operations, Director approvals,
 * HOD/admin oversight. Client nav is UX only — every list is server-filtered.
 */
export default async function PlacementPage() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Placement &amp; career</p>
            <h1>Sign in to open Placement</h1>
            <p className="page-description">
              Opportunities, applications, and career profile live inside your
              authorized institutional scope.
            </p>
          </div>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  const scope = await getPlacementScope(ctx);

  if (scope.access === "denied") {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Placement &amp; career</p>
            <h1>Placement access</h1>
            <p className="page-description">
              This workspace is limited to students, TPO, assigned placement
              faculty, Director/Dean, HOD, and institution admin.
            </p>
          </div>
        </div>
        <section className="coming-soon-panel">
          <div className="panel-line" />
          <p className="panel-label">Access</p>
          <h2>Not available for your role</h2>
          <p>
            System administration and external recruiter roles do not receive
            placement operational or approval powers.
          </p>
          <Link className="text-link" href="/">
            Back to dashboard <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </div>
    );
  }

  const counts = await loadPlacementCounts(ctx);

  const [opportunities, applications] = await Promise.all([
    listOpportunities(ctx, { limit: 6 }),
    listApplications(ctx, { limit: 6, mine: scope.access === "student" }),
  ]);

  const isStudent = scope.access === "student";
  const isOperator = scope.access === "operator";
  const isApprover = scope.access === "approver";

  const eyebrow = isStudent
    ? "Student career"
    : isOperator
      ? "Placement operations"
      : isApprover
        ? "Placement approvals"
        : "Placement oversight";

  const heading = isStudent ? "My career" : "Placement";
  const contextLine = isStudent
    ? "Open opportunities you are eligible for, track applications, and keep your career profile ready."
    : isOperator
      ? "Manage companies, opportunities, applications, interviews, offers, and appointments."
      : isApprover
        ? "Approve companies, opportunities, and TPO / placement faculty appointments."
        : "Read-only view of institutional placement activity in your scope.";

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{heading}</h1>
          <p className="welcome-copy">{contextLine}</p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span>↗</span>
        </div>
      </section>

      <section className="overview-grid dash-stats" aria-label="Overview">
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-teal" aria-hidden="true">
            ◎
          </span>
          <strong>{counts.openOpportunities ?? 0}</strong>
          <span>Open opportunities</span>
        </div>
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-orange" aria-hidden="true">
            ✓
          </span>
          <strong>{counts.applications ?? 0}</strong>
          <span>{isStudent ? "My applications" : "Applications"}</span>
        </div>
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-teal" aria-hidden="true">
            ◎
          </span>
          <strong>{counts.placements ?? 0}</strong>
          <span>{isStudent ? "My placements" : "Placements recorded"}</span>
        </div>
      </section>

      <section className="content-section" aria-label="Opportunities">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {isStudent ? "Eligible now" : "Opportunities"}
            </p>
            <h2>
              {isStudent ? "Open opportunities" : "Recent opportunities"}
            </h2>
          </div>
          <Link className="text-link" href="/placement/opportunities">
            View all <span aria-hidden="true">↗</span>
          </Link>
        </div>
        {opportunities.length === 0 ? (
          <p className="empty-state">
            {isStudent
              ? "No open opportunities match your enrollment right now. Check back after the placement cell publishes new roles."
              : "No opportunities yet. Create a company first, then add an opportunity for approval."}
          </p>
        ) : (
          <div className="dash-panel" style={{ marginTop: 19 }}>
            <div className="dash-list">
              {opportunities.map((o) => (
                <Link
                  className="dash-row"
                  href={`/placement/opportunities/${o.id}`}
                  key={o.id}
                >
                  <div>
                    <strong>{o.title}</strong>
                    <small>
                      {o.company_name} · {o.opportunity_kind}
                      {o.location ? ` · ${o.location}` : ""}
                      {o.application_deadline
                        ? ` · deadline ${String(o.application_deadline).slice(0, 10)}`
                        : ""}
                    </small>
                  </div>
                  <span className="status-pill">{o.status}</span>
                  <span className="activity-arrow" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="content-section" aria-label="Applications">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Pipeline</p>
            <h2>{isStudent ? "My applications" : "Recent applications"}</h2>
          </div>
          <Link className="text-link" href="/placement/applications">
            View all <span aria-hidden="true">↗</span>
          </Link>
        </div>
        {applications.length === 0 ? (
          <p className="empty-state">
            {isStudent
              ? "You have not applied yet. Open an eligible opportunity and submit your application."
              : "No applications in scope yet."}
          </p>
        ) : (
          <div className="dash-panel" style={{ marginTop: 19 }}>
            <div className="dash-list">
              {applications.map((a) => (
                <Link
                  className="dash-row"
                  href={`/placement/applications/${a.id}`}
                  key={a.id}
                >
                  <div>
                    <strong>{a.opportunity_title}</strong>
                    <small>
                      {isStudent
                        ? a.company_name
                        : `${a.student_name} · ${a.company_name}`}
                    </small>
                  </div>
                  <span className="status-pill">{a.status}</span>
                  <span className="activity-arrow" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="content-section" aria-label="Quick links">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Move forward</p>
            <h2>Quick access</h2>
          </div>
        </div>
        <div className="quick-grid">
          {isStudent ? (
            <>
              <Link className="quick-card quick-card-green" href="/placement/profile">
                <span className="quick-icon" aria-hidden="true">
                  ✦
                </span>
                <span>
                  <strong>Career profile</strong>
                  <small>Skills, interests, readiness</small>
                </span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
              <Link
                className="quick-card quick-card-blue"
                href="/placement/opportunities"
              >
                <span className="quick-icon" aria-hidden="true">
                  ◎
                </span>
                <span>
                  <strong>Opportunities</strong>
                  <small>Jobs &amp; internships</small>
                </span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
              <Link
                className="quick-card quick-card-gold"
                href="/placement/applications"
              >
                <span className="quick-icon" aria-hidden="true">
                  ✓
                </span>
                <span>
                  <strong>My applications</strong>
                  <small>Track every stage</small>
                </span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
            </>
          ) : isOperator ? (
            <>
              <Link className="quick-card quick-card-blue" href="/placement/companies">
                <span className="quick-icon" aria-hidden="true">
                  ◎
                </span>
                <span>
                  <strong>Companies</strong>
                  <small>Directory &amp; approval status</small>
                </span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
              <Link
                className="quick-card quick-card-gold"
                href="/placement/opportunities"
              >
                <span className="quick-icon" aria-hidden="true">
                  ✓
                </span>
                <span>
                  <strong>Opportunities</strong>
                  <small>Draft, submit, open, close</small>
                </span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
              <Link
                className="quick-card quick-card-green"
                href="/placement/appointments"
              >
                <span className="quick-icon" aria-hidden="true">
                  ✦
                </span>
                <span>
                  <strong>Appointments</strong>
                  <small>TPO &amp; placement faculty history</small>
                </span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
            </>
          ) : isApprover ? (
            <>
              <Link
                className="quick-card quick-card-gold"
                href="/placement/approvals"
              >
                <span className="quick-icon" aria-hidden="true">
                  ✓
                </span>
                <span>
                  <strong>Approvals</strong>
                  <small>Companies, opportunities, appointments</small>
                </span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
              <Link
                className="quick-card quick-card-blue"
                href="/placement/appointments"
              >
                <span className="quick-icon" aria-hidden="true">
                  ◎
                </span>
                <span>
                  <strong>Appointments</strong>
                  <small>Approve or end responsibilities</small>
                </span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
              <Link
                className="quick-card quick-card-green"
                href="/placement/companies"
              >
                <span className="quick-icon" aria-hidden="true">
                  ✦
                </span>
                <span>
                  <strong>Companies</strong>
                  <small>Review pending companies</small>
                </span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
            </>
          ) : (
            <>
              <Link
                className="quick-card quick-card-blue"
                href="/placement/opportunities"
              >
                <span className="quick-icon" aria-hidden="true">
                  ◎
                </span>
                <span>
                  <strong>Opportunities</strong>
                  <small>Institution activity</small>
                </span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
              <Link
                className="quick-card quick-card-gold"
                href="/placement/applications"
              >
                <span className="quick-icon" aria-hidden="true">
                  ✓
                </span>
                <span>
                  <strong>Applications</strong>
                  <small>Pipeline overview</small>
                </span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
              <Link
                className="quick-card quick-card-green"
                href="/placement/appointments"
              >
                <span className="quick-icon" aria-hidden="true">
                  ✦
                </span>
                <span>
                  <strong>Appointments</strong>
                  <small>Responsibility history</small>
                </span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
