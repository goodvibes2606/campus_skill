import Link from "next/link";

import { getAuthContext, AuthzError } from "@/lib/authz";
import { getPlacementScope } from "@/lib/placement-scope";
import {
  getApplication,
  listApplicationEvents,
} from "@/lib/placement-applications";
import { ApplicationActions } from "@/components/placement/application-actions";

export default async function ApplicationDetailPage({
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
            <p className="eyebrow">Application</p>
            <h1>Sign in to view this application</h1>
          </div>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  let application;
  try {
    application = await getApplication(ctx, id);
  } catch (error) {
    if (error instanceof AuthzError) {
      return (
        <div className="placeholder-page">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Application</p>
              <h1>Not found</h1>
              <p className="page-description">
                You can only open applications inside your authorized scope.
              </p>
            </div>
          </div>
          <Link className="text-link" href="/placement/applications">
            Back to applications <span aria-hidden="true">↗</span>
          </Link>
        </div>
      );
    }
    throw error;
  }

  const events = await listApplicationEvents(ctx, application.id);
  const scope = await getPlacementScope(ctx);
  const isStudent = scope.access === "student";
  const isOperator = scope.access === "operator";

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Application</p>
          <h1>{application.opportunity_title}</h1>
          <p className="welcome-copy">
            {isStudent
              ? application.company_name
              : `${application.student_name} · ${application.company_name}`}
          </p>
        </div>
        <span className="status-pill">{application.status}</span>
      </section>

      <div className="dash-grid" style={{ marginTop: 0 }}>
        <section className="dash-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Summary</p>
              <h2>Details</h2>
            </div>
          </div>
          <div className="dash-list">
            <div className="dash-row">
              <div>
                <strong>Status</strong>
                <small>{application.status}</small>
              </div>
            </div>
            <div className="dash-row">
              <div>
                <strong>Submitted</strong>
                <small>
                  {new Date(application.submitted_at).toLocaleString()}
                </small>
              </div>
            </div>
            {application.decided_at ? (
              <div className="dash-row">
                <div>
                  <strong>Decided</strong>
                  <small>{new Date(application.decided_at).toLocaleString()}</small>
                </div>
              </div>
            ) : null}
            {application.cover_note ? (
              <div className="dash-row">
                <div>
                  <strong>Cover note</strong>
                  <small>{application.cover_note}</small>
                </div>
              </div>
            ) : null}
            {!isStudent ? (
              <div className="dash-row">
                <div>
                  <strong>Student</strong>
                  <small>
                    {application.student_name} · {application.student_email}
                  </small>
                </div>
              </div>
            ) : null}
          </div>

          <ApplicationActions
            applicationId={application.id}
            status={application.status}
            isStudent={isStudent}
            isOperator={isOperator}
            isOwn={application.is_own}
          />
        </section>

        <section className="dash-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">History</p>
              <h2>Status timeline</h2>
            </div>
          </div>
          {events.length === 0 ? (
            <p className="empty-state">No status events recorded yet.</p>
          ) : (
            <div className="dash-list">
              {events.map((e) => (
                <div className="dash-row" key={e.id}>
                  <div>
                    <strong>
                      {e.from_status ? `${e.from_status} → ` : ""}
                      {e.to_status}
                    </strong>
                    <small>
                      {e.actor_name ? `${e.actor_name} · ` : ""}
                      {new Date(e.created_at).toLocaleString()}
                      {e.note ? ` · ${e.note}` : ""}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="content-section">
        <Link className="text-link" href="/placement/applications">
          ← All applications
        </Link>
      </section>
    </div>
  );
}
