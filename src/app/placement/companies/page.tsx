import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import { getPlacementScope } from "@/lib/placement-scope";
import { listCompanies } from "@/lib/placement-companies";
import { CompanyCreateForm } from "@/components/placement/company-create-form";
import { CompanyStatusActions } from "@/components/placement/company-status-actions";

/**
 * Company directory — operator/approver/oversight only (students denied).
 */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await getAuthContext();
  const params = await searchParams;

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Companies</p>
            <h1>Sign in to view companies</h1>
          </div>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  const scope = await getPlacementScope(ctx);
  if (scope.access === "denied" || scope.access === "student") {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Companies</p>
            <h1>Placement staff only</h1>
            <p className="page-description">
              Company records are managed by TPO / placement staff and reviewed
              by Director/Dean.
            </p>
          </div>
        </div>
        <Link className="text-link" href="/placement">
          Placement hub <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  }

  const companies = await listCompanies(ctx, {
    status: params.status,
    limit: 200,
  });

  const canCreate =
    scope.access === "operator" && scope.operateDepartmentIds === null;
  const canApprove = scope.canApprove;

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Placement</p>
          <h1>Companies</h1>
          <p className="welcome-copy">
            Institution-wide company directory. Approval is Director/Dean only.
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span>▦</span>
        </div>
      </section>

      {canCreate ? <CompanyCreateForm /> : null}
      {!canCreate && scope.access === "operator" ? (
        <p className="placement-muted" style={{ marginBottom: 12 }}>
          Company records are institution-wide — only the TPO may create them.
          Your responsibility is department-scoped.
        </p>
      ) : null}

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Directory</p>
            <h2>
              {companies.length === 0
                ? "No companies"
                : `${companies.length} compan${companies.length === 1 ? "y" : "ies"}`}
            </h2>
          </div>
          <Link className="text-link" href="/placement">
            Placement hub <span aria-hidden="true">↗</span>
          </Link>
        </div>

        {companies.length === 0 ? (
          <p className="empty-state">
            No companies registered yet. Create the first company to start the
            opportunity catalog.
          </p>
        ) : (
          <div className="dash-panel" style={{ marginTop: 19 }}>
            <div className="dash-list">
              {companies.map((c) => (
                <div className="dash-row" key={c.id}>
                  <div>
                    <strong>{c.name}</strong>
                    <small>
                      {c.industry || "Industry —"}
                      {c.location ? ` · ${c.location}` : ""}
                      {` · ${c.opportunity_count} opportunit${c.opportunity_count === 1 ? "y" : "ies"}`}
                      {c.website ? ` · ${c.website}` : ""}
                    </small>
                  </div>
                  <span className="status-pill">{c.status}</span>
                  <CompanyStatusActions
                    companyId={c.id}
                    status={c.status}
                    canOperate={canCreate}
                    canApprove={canApprove}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
