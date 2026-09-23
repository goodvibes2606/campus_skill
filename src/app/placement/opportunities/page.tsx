import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import { getPlacementScope } from "@/lib/placement-scope";
import {
  listOpportunities,
} from "@/lib/placement-opportunities";
import { listCompanies } from "@/lib/placement-companies";
import { OpportunityCreateForm } from "@/components/placement/opportunity-create-form";

/**
 * Placement opportunities list (role-filtered server-side).
 * Students: open + eligible only. Operators: full lifecycle in scope.
 */
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string }>;
}) {
  const ctx = await getAuthContext();
  const params = await searchParams;

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Opportunities</p>
            <h1>Sign in to browse opportunities</h1>
            <p className="page-description">
              Only eligible open roles appear for students; operators see the
              full lifecycle in their scope.
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
            <p className="eyebrow">Opportunities</p>
            <h1>No placement access</h1>
            <p className="page-description">
              Your role is not authorized for the placement workspace.
            </p>
          </div>
        </div>
        <Link className="text-link" href="/">
          Back to dashboard <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  }

  const opportunities = await listOpportunities(ctx, {
    status: params.status,
    kind: params.kind,
    limit: 100,
  });

  const canCreate = scope.access === "operator";
  const companies = canCreate
    ? (await listCompanies(ctx, { status: "approved", limit: 100 })).filter(
        (c) => c.status === "approved"
      )
    : [];

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Placement</p>
          <h1>Opportunities</h1>
          <p className="welcome-copy">
            {scope.access === "student"
              ? "Open roles you are eligible for. Apply once per opportunity."
              : "Jobs and internships across draft, approval, open, and closed stages."}
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span>◎</span>
        </div>
      </section>

      {canCreate ? (
        <OpportunityCreateForm companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
      ) : null}

      <section className="content-section" aria-label="List">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Catalog</p>
            <h2>
              {opportunities.length === 0
                ? "No opportunities"
                : `${opportunities.length} opportunit${opportunities.length === 1 ? "y" : "ies"}`}
            </h2>
          </div>
          <Link className="text-link" href="/placement">
            Placement hub <span aria-hidden="true">↗</span>
          </Link>
        </div>

        {opportunities.length === 0 ? (
          <p className="empty-state">
            {scope.access === "student"
              ? "No open opportunities match your enrollment right now."
              : "No opportunities yet. Approve a company first, then create an opportunity."}
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
                      {o.employment_type ? ` · ${o.employment_type}` : ""}
                      {o.location ? ` · ${o.location}` : ""}
                      {o.application_deadline
                        ? ` · deadline ${String(o.application_deadline).slice(0, 10)}`
                        : ""}
                      {scope.access !== "student"
                        ? ` · ${o.application_count} application(s)`
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
    </div>
  );
}
