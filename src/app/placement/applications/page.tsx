import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import { getPlacementScope } from "@/lib/placement-scope";
import { listApplications } from "@/lib/placement-applications";

/**
 * Applications list — students see only their own rows (server-side).
 */
export default async function ApplicationsPage({
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
            <p className="eyebrow">Applications</p>
            <h1>Sign in to view applications</h1>
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
            <p className="eyebrow">Applications</p>
            <h1>No placement access</h1>
          </div>
        </div>
        <Link className="text-link" href="/">
          Dashboard <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  }

  const applications = await listApplications(ctx, {
    status: params.status,
    mine: scope.access === "student",
    limit: 200,
  });

  const isStudent = scope.access === "student";

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Placement</p>
          <h1>{isStudent ? "My applications" : "Applications"}</h1>
          <p className="welcome-copy">
            {isStudent
              ? "Track screening, shortlist, interview, offer, and joining stages."
              : "Pipeline across submitted → screening → shortlist → interview → offer → placement."}
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span>✓</span>
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Pipeline</p>
            <h2>
              {applications.length === 0
                ? "No applications"
                : `${applications.length} application${applications.length === 1 ? "" : "s"}`}
            </h2>
          </div>
          <Link className="text-link" href="/placement">
            Placement hub <span aria-hidden="true">↗</span>
          </Link>
        </div>

        {applications.length === 0 ? (
          <p className="empty-state">
            {isStudent
              ? "No applications yet. Open an eligible opportunity and apply."
              : "No applications in your scope yet."}
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
                      {` · submitted ${new Date(a.submitted_at).toLocaleDateString()}`}
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
    </div>
  );
}
