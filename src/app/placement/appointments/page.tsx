import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import { getPlacementScope } from "@/lib/placement-scope";
import {
  listPlacementResponsibilities,
} from "@/lib/placement-appointments";
import { AppointmentRequestForm } from "@/components/placement/appointment-request-form";
import { AppointmentDecisionButtons } from "@/components/placement/appointment-decision-buttons";

/**
 * Placement appointments — history-preserving TPO / placement faculty rows.
 */
export default async function AppointmentsPage({
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
            <p className="eyebrow">Appointments</p>
            <h1>Sign in to view appointments</h1>
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
            <p className="eyebrow">Appointments</p>
            <h1>No placement access</h1>
          </div>
        </div>
        <Link className="text-link" href="/">
          Dashboard <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  }

  const rows = await listPlacementResponsibilities(ctx, {
    status: params.status,
    limit: 200,
  });

  const canCreate = scope.canCreateAppointments;
  const canDecide = scope.canApprove;

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Placement</p>
          <h1>Appointments</h1>
          <p className="welcome-copy">
            History-preserving TPO and placement faculty responsibilities.
            Approving a new appointment ends the previous active row — nothing
            is overwritten.
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span>✦</span>
        </div>
      </section>

      {canCreate ? <AppointmentRequestForm /> : null}

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">History</p>
            <h2>
              {rows.length === 0
                ? "No appointments"
                : `${rows.length} appointment${rows.length === 1 ? "" : "s"}`}
            </h2>
          </div>
          <Link className="text-link" href="/placement">
            Placement hub <span aria-hidden="true">↗</span>
          </Link>
        </div>

        {rows.length === 0 ? (
          <p className="empty-state">
            No placement appointments recorded yet. Director/Dean or institution
            admin can request a TPO appointment for approval.
          </p>
        ) : (
          <div className="dash-panel" style={{ marginTop: 19 }}>
            <div className="dash-list">
              {rows.map((r) => (
                <div className="dash-row" key={r.id}>
                  <div>
                    <strong>
                      {r.person_name} · {r.responsibility_title}
                    </strong>
                    <small>
                      {r.responsibility}
                      {r.department_name ? ` · ${r.department_name}` : " · institution-wide"}
                      {r.starts_on
                        ? ` · from ${String(r.starts_on).slice(0, 10)}`
                        : ""}
                      {r.ends_on ? ` · to ${String(r.ends_on).slice(0, 10)}` : ""}
                      {r.approver_name ? ` · approved by ${r.approver_name}` : ""}
                    </small>
                  </div>
                  <span className="status-pill">{r.status}</span>
                  <AppointmentDecisionButtons
                    appointmentId={r.id}
                    status={r.status}
                    canDecide={canDecide}
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
