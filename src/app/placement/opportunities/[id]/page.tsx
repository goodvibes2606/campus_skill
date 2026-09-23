import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import { getPlacementScope } from "@/lib/placement-scope";
import { getOpportunity } from "@/lib/placement-opportunities";
import { getCompany } from "@/lib/placement-companies";
import { AuthzError } from "@/lib/authz";
import { OpportunityActions } from "@/components/placement/opportunity-actions";
import { ApplyButton } from "@/components/placement/apply-button";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Opportunity</p>
            <h1>Sign in to view this opportunity</h1>
          </div>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  let opportunity;
  try {
    opportunity = await getOpportunity(ctx, id);
  } catch (error) {
    if (error instanceof AuthzError) {
      return (
        <div className="placeholder-page">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Opportunity</p>
              <h1>Not available</h1>
              <p className="page-description">
                This opportunity is outside your scope or not visible to your
                role.
              </p>
            </div>
          </div>
          <Link className="text-link" href="/placement/opportunities">
            Back to opportunities <span aria-hidden="true">↗</span>
          </Link>
        </div>
      );
    }
    throw error;
  }

  const scope = await getPlacementScope(ctx);
  const canSeeCompany = scope.access !== "student";
  let company: Awaited<ReturnType<typeof getCompany>> | null = null;
  if (canSeeCompany) {
    try {
      company = await getCompany(ctx, opportunity.company_id);
    } catch {
      company = null;
    }
  }

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">{opportunity.opportunity_kind}</p>
          <h1>{opportunity.title}</h1>
          <p className="welcome-copy">
            {opportunity.company_name}
            {opportunity.location ? ` · ${opportunity.location}` : ""}
            {opportunity.application_deadline
              ? ` · deadline ${String(opportunity.application_deadline).slice(0, 10)}`
              : ""}
          </p>
        </div>
        <span className="status-pill">{opportunity.status}</span>
      </section>

      <div className="dash-grid" style={{ marginTop: 0 }}>
        <section className="dash-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Details</p>
              <h2>About this role</h2>
            </div>
          </div>
          <p className="placement-body">
            {opportunity.description || "No description provided."}
          </p>
          <div className="dash-list">
            <div className="dash-row">
              <div>
                <strong>Employment type</strong>
                <small>{opportunity.employment_type || "—"}</small>
              </div>
            </div>
            <div className="dash-row">
              <div>
                <strong>Compensation</strong>
                <small>{opportunity.compensation || "—"}</small>
              </div>
            </div>
            <div className="dash-row">
              <div>
                <strong>Interview notes</strong>
                <small>{opportunity.interview_notes || "—"}</small>
              </div>
            </div>
            {canSeeCompany && company ? (
              <div className="dash-row">
                <div>
                  <strong>Company contact</strong>
                  <small>
                    {company.contact_name || "—"}
                    {company.contact_email ? ` · ${company.contact_email}` : ""}
                  </small>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="dash-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Eligibility</p>
              <h2>Who can apply</h2>
            </div>
          </div>
          {opportunity.eligibility.length === 0 ? (
            <p className="empty-state">
              Open to every student in the institution with an active
              enrollment (no cohort restriction).
            </p>
          ) : (
            <div className="dash-list">
              {opportunity.eligibility.map((e) => (
                <div className="dash-row" key={e.id}>
                  <div>
                    <strong>
                      {e.program_name ||
                        e.department_name ||
                        e.section_name ||
                        "Cohort"}
                    </strong>
                    <small>
                      {[
                        e.department_name,
                        e.program_name,
                        e.section_name,
                        e.semester_from != null || e.semester_to != null
                          ? `Sem ${e.semester_from ?? 1}–${e.semester_to ?? "…"}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || e.notes || "Scoped cohort"}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}

          {scope.access === "student" ? (
            <div className="auth-actions-row">
              <ApplyButton opportunityId={opportunity.id} />
            </div>
          ) : (
            <OpportunityActions
              opportunityId={opportunity.id}
              status={opportunity.status}
              canOperate={scope.access === "operator"}
              canApprove={scope.canApprove}
            />
          )}
        </section>
      </div>

      <section className="content-section">
        <Link className="text-link" href="/placement/opportunities">
          ← All opportunities
        </Link>
      </section>
    </div>
  );
}
