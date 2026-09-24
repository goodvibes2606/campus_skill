import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import { getPlacementScope } from "@/lib/placement-scope";
import { listCompanies } from "@/lib/placement-companies";
import { listOpportunities } from "@/lib/placement-opportunities";
import { listPlacementResponsibilities } from "@/lib/placement-appointments";
import { ApprovalActionButtons } from "@/components/placement/approval-action-buttons";

/**
 * Director/Dean approval overview (companies, opportunities, appointments).
 * HOD/admin get a read-only queue (no approval authority).
 */
export default async function ApprovalsPage() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Approvals</p>
            <h1>Sign in to view approvals</h1>
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
            <p className="eyebrow">Approvals</p>
            <h1>No placement access</h1>
          </div>
        </div>
        <Link className="text-link" href="/">
          Dashboard <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  }

  const canApprove = scope.canApprove;

  const [pendingCompanies, pendingOpps, pendingAppointments] =
    await Promise.all([
      listCompanies(ctx, { status: "pending_approval", limit: 50 }),
      listOpportunities(ctx, { status: "pending_approval", limit: 50 }),
      listPlacementResponsibilities(ctx, { status: "pending", limit: 50 }),
    ]);

  const total =
    pendingCompanies.length + pendingOpps.length + pendingAppointments.length;

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">
            {canApprove ? "Director / Dean" : "Oversight"}
          </p>
          <h1>Approvals</h1>
          <p className="welcome-copy">
            {canApprove
              ? "Approve or reject companies, opportunities, and placement appointments. You do not edit operational content here."
              : "Read-only pending queue — approval authority stays with Director/Dean."}
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span>✓</span>
        </div>
      </section>

      <section className="overview-grid dash-stats" aria-label="Pending totals">
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-orange" aria-hidden="true">
            ✓
          </span>
          <strong>{pendingCompanies.length}</strong>
          <span>Pending companies</span>
        </div>
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-teal" aria-hidden="true">
            ◎
          </span>
          <strong>{pendingOpps.length}</strong>
          <span>Pending opportunities</span>
        </div>
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-orange" aria-hidden="true">
            ✓
          </span>
          <strong>{pendingAppointments.length}</strong>
          <span>Pending appointments</span>
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Companies</p>
            <h2>Awaiting company approval</h2>
          </div>
        </div>
        {pendingCompanies.length === 0 ? (
          <p className="empty-state">No companies awaiting approval.</p>
        ) : (
          <div className="dash-panel" style={{ marginTop: 19 }}>
            <div className="dash-list">
              {pendingCompanies.map((c) => (
                <div className="dash-row" key={c.id}>
                  <div>
                    <strong>{c.name}</strong>
                    <small>
                      {c.industry || "Industry —"}
                      {c.location ? ` · ${c.location}` : ""}
                    </small>
                  </div>
                  <span className="status-pill">{c.status}</span>
                  <ApprovalActionButtons
                    kind="company"
                    id={c.id}
                    canApprove={canApprove}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Opportunities</p>
            <h2>Awaiting opportunity approval</h2>
          </div>
        </div>
        {pendingOpps.length === 0 ? (
          <p className="empty-state">No opportunities awaiting approval.</p>
        ) : (
          <div className="dash-panel" style={{ marginTop: 19 }}>
            <div className="dash-list">
              {pendingOpps.map((o) => (
                <div className="dash-row" key={o.id}>
                  <div>
                    <strong>{o.title}</strong>
                    <small>
                      {o.company_name} · {o.opportunity_kind}
                    </small>
                  </div>
                  <span className="status-pill">{o.status}</span>
                  <ApprovalActionButtons
                    kind="opportunity"
                    id={o.id}
                    canApprove={canApprove}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Appointments</p>
            <h2>Awaiting appointment approval</h2>
          </div>
        </div>
        {pendingAppointments.length === 0 ? (
          <p className="empty-state">No appointments awaiting approval.</p>
        ) : (
          <div className="dash-panel" style={{ marginTop: 19 }}>
            <div className="dash-list">
              {pendingAppointments.map((r) => (
                <div className="dash-row" key={r.id}>
                  <div>
                    <strong>
                      {r.person_name} · {r.responsibility_title}
                    </strong>
                    <small>
                      {r.responsibility}
                      {r.department_name
                        ? ` · ${r.department_name}`
                        : " · institution-wide"}
                    </small>
                  </div>
                  <span className="status-pill">{r.status}</span>
                  <ApprovalActionButtons
                    kind="appointment"
                    id={r.id}
                    canApprove={canApprove}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {total === 0 ? (
        <section className="content-section">
          <p className="empty-state">
            Nothing is waiting for approval right now.
          </p>
        </section>
      ) : null}

      <section className="content-section">
        <Link className="text-link" href="/placement">
          Placement hub <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </div>
  );
}
