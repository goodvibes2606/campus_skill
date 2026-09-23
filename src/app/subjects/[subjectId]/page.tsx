import Link from "next/link";

import { getAuthContext, AuthzError } from "@/lib/authz";
import { loadSubjectWorkspace, type SubjectWorkspace } from "@/lib/student-academics";

function formatDay(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function submissionBadge(
  status: string | null | undefined
): string | undefined {
  if (!status) return undefined;
  if (status === "submitted") return "submitted";
  if (status === "graded") return "graded";
  if (status === "returned") return "returned";
  if (status === "draft") return "draft";
  return status;
}

function renderWorkspace(ws: SubjectWorkspace, contextLine: string) {
  const pendingLabel =
    ws.pendingCount === 0
      ? "Nothing pending — you are up to date."
      : `${ws.pendingCount} assignment${ws.pendingCount === 1 ? "" : "s"} need${ws.pendingCount === 1 ? "s" : ""} attention.`;

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">
            {ws.subject.subject_code} · Subject workspace
          </p>
          <h1>{ws.subject.name}</h1>
          <p className="welcome-copy">
            {contextLine}
            {ws.subject.faculty_name
              ? ` · Faculty: ${ws.subject.faculty_name}`
              : " · No faculty assigned"}
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span>✦</span>
        </div>
      </section>

      <section className="overview-grid dash-stats" aria-label="Overview">
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-teal" aria-hidden="true">
            ◎
          </span>
          <strong>{ws.assignments.length}</strong>
          <span>Assignments visible</span>
        </div>
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-orange" aria-hidden="true">
            ✓
          </span>
          <strong>{ws.pendingCount}</strong>
          <span>Pending submissions</span>
        </div>
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-teal" aria-hidden="true">
            ◎
          </span>
          <strong>{ws.resources.length}</strong>
          <span>Published resources</span>
        </div>
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-orange" aria-hidden="true">
            ✓
          </span>
          <strong>{ws.syllabi.length}</strong>
          <span>Published syllabi</span>
        </div>
      </section>

      <section className="content-section" aria-label="Pending">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your work</p>
            <h2>Submission status</h2>
          </div>
          <Link className="quiet-button" href="/assignments">
            Open assessments →
          </Link>
        </div>
        <p className="empty-state">{pendingLabel}</p>
      </section>

      <section className="dash-grid" aria-label="Subject panels">
        <section className="dash-panel" aria-label="Assignments">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Coursework</p>
              <h2>Assignments</h2>
            </div>
            <Link className="quiet-button" href="/assignments">
              View all →
            </Link>
          </div>
          {ws.assignments.length === 0 ? (
            <p className="empty-state">
              No published assignments for this subject yet.
            </p>
          ) : (
            <div className="dash-list">
              {ws.assignments.map((a) => (
                <Link className="dash-row" href="/assignments" key={a.id}>
                  <div>
                    <strong>{a.title}</strong>
                    <small>
                      {a.due_at ? `Due ${formatDay(a.due_at)}` : "No due date"}
                      {a.max_points !== null ? ` · ${a.max_points} pts` : ""}
                      {ws.subject.faculty_name
                        ? ` · ${ws.subject.faculty_name}`
                        : ""}
                    </small>
                    <small>
                      {a.my_submission
                        ? `Your attempt ${a.my_submission.attempt_number}${
                            a.my_submission.score !== null
                              ? ` · score ${a.my_submission.score}${
                                  a.my_submission.max_points_snapshot !== null
                                    ? `/${a.my_submission.max_points_snapshot}`
                                    : ""
                                }`
                              : ""
                          }${a.my_submission.feedback ? ` · ${a.my_submission.feedback}` : ""}`
                        : "No submission yet"}
                    </small>
                  </div>
                  <span className="status-pill">
                    {submissionBadge(a.my_submission?.status) ?? a.status}
                  </span>
                  <span className="activity-arrow" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="dash-panel" aria-label="Resources">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Study materials</p>
              <h2>Resources</h2>
            </div>
            <Link className="quiet-button" href="/notes">
              Open notes →
            </Link>
          </div>
          {ws.resources.length === 0 ? (
            <p className="empty-state">
              No published resources for this subject yet.
            </p>
          ) : (
            <div className="dash-list">
              {ws.resources.map((r) => (
                <Link className="dash-row" href="/notes" key={r.id}>
                  <div>
                    <strong>{r.title}</strong>
                    <small>
                      {r.resource_type} · v{r.version}
                      {r.original_filename ? ` · ${r.original_filename}` : ""}
                    </small>
                    {r.description ? <small>{r.description}</small> : null}
                  </div>
                  <span className="status-pill">{r.status}</span>
                  <span className="activity-arrow" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="dash-panel" aria-label="Syllabus">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Curriculum</p>
              <h2>Syllabus &amp; topics</h2>
            </div>
            <Link className="quiet-button" href="/syllabus">
              Open syllabus →
            </Link>
          </div>
          {ws.syllabi.length === 0 ? (
            <p className="empty-state">
              No published syllabus for this subject yet. Structure and covered
              progress appear when faculty publish units and topics.
            </p>
          ) : (
            <div className="dash-list">
              {ws.syllabi.map((s) => (
                <div className="dash-row" key={s.id} style={{ display: "block" }}>
                  <div>
                    <strong>
                      {s.title}{" "}
                      <span className="status-pill">
                        v{s.version} · {s.status}
                      </span>
                    </strong>
                    <small>
                      {s.academic_year_name} · {s.unit_count} unit
                      {s.unit_count === 1 ? "" : "s"} · by {s.creator_name}
                    </small>
                  </div>
                  {s.units.length === 0 ? (
                    <small>No units recorded yet.</small>
                  ) : (
                    <ul
                      style={{
                        listStyle: "none",
                        margin: "8px 0 4px",
                        padding: 0,
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      {s.units.map((u) => (
                        <li key={u.id}>
                          <small>
                            <strong>
                              Unit {u.unit_number}: {u.title}
                            </strong>
                            {u.topics.length > 0
                              ? ` — ${u.topics
                                  .map((t) => t.title)
                                  .join(" · ")}`
                              : " — no topics yet"}
                          </small>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dash-panel" aria-label="Assessments">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Tests &amp; papers</p>
              <h2>MST &amp; question papers</h2>
            </div>
            <Link className="quiet-button" href="/assignments">
              Open assessments →
            </Link>
          </div>
          {ws.msts.length === 0 && ws.papers.length === 0 ? (
            <p className="empty-state">
              No published MST or question papers for this subject yet.
            </p>
          ) : (
            <div className="dash-list">
              {ws.msts.map((m) => (
                <Link className="dash-row" href="/assignments" key={m.id}>
                  <div>
                    <strong>
                      MST-{m.mst_number}: {m.title}
                    </strong>
                    <small>
                      {m.scheduled_on
                        ? `Scheduled ${formatDay(m.scheduled_on)}`
                        : "No date"}{" "}
                      · {m.max_marks} marks · {m.academic_year_name}
                    </small>
                  </div>
                  <span className="status-pill">{m.status}</span>
                  <span className="activity-arrow" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
              {ws.papers.map((p) => (
                <Link className="dash-row" href="/assignments" key={p.id}>
                  <div>
                    <strong>{p.title}</strong>
                    <small>
                      {p.paper_kind} · {p.total_marks} marks
                      {p.duration_minutes
                        ? ` · ${p.duration_minutes} min`
                        : ""}{" "}
                      · {p.item_count} item(s)
                    </small>
                  </div>
                  <span className="status-pill">{p.status}</span>
                  <span className="activity-arrow" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </section>

      <section className="content-section" aria-label="Back">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Navigate</p>
            <h2>All subjects</h2>
          </div>
        </div>
        <div className="quick-grid">
          <Link className="quick-card quick-card-green" href="/subjects">
            <span className="quick-icon" aria-hidden="true">
              ✦
            </span>
            <span>
              <strong>Back to my subjects</strong>
              <small>See every enrolled subject</small>
            </span>
            <span className="arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
          <Link className="quick-card quick-card-gold" href="/assignments">
            <span className="quick-icon" aria-hidden="true">
              ✓
            </span>
            <span>
              <strong>Assignments</strong>
              <small>Submit work across subjects</small>
            </span>
            <span className="arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
          <Link className="quick-card quick-card-blue" href="/">
            <span className="quick-icon" aria-hidden="true">
              ▤
            </span>
            <span>
              <strong>Dashboard</strong>
              <small>Return to overview</small>
            </span>
            <span className="arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}

function renderDenied(message: string) {
  return (
    <div className="placeholder-page" role="alert">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Access</p>
          <h1>Subject not available</h1>
          <p className="page-description">
            This subject is outside your enrolled section, or the link is no
            longer active. Server-side checks block cross-section access.
          </p>
        </div>
        <div className="placeholder-seal" aria-hidden="true">
          !
        </div>
      </div>
      <section className="coming-soon-panel">
        <div className="panel-line" />
        <p className="panel-label">Authorization</p>
        <h2>Not in your academic context</h2>
        <p>{message}</p>
        <div className="auth-actions-row">
          <Link className="text-link" href="/subjects">
            Back to my subjects <span aria-hidden="true">↗</span>
          </Link>
          <Link className="text-link" href="/">
            Dashboard <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

function renderSignedOut() {
  return (
    <div className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Student academics</p>
          <h1>Sign in to open a subject</h1>
          <p className="page-description">
            Subject workspaces are available only inside your authorized
            academic scope.
          </p>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    </div>
  );
}

/**
 * Subject workspace — Milestone 8.
 * URL subjectId is validated server-side against the active enrollment
 * section_subjects set before any content loads.
 */
export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  const ctx = await getAuthContext();

  if (!ctx) return renderSignedOut();

  if (ctx.roleName !== "student") {
    return renderDenied("Only the student role can open a subject workspace.");
  }

  try {
    const ws = await loadSubjectWorkspace(ctx, subjectId);
    const contextLine = [
      ws.subject.subject_code,
      "enrolled subject",
    ].join(" · ");
    return renderWorkspace(ws, contextLine);
  } catch (error) {
    if (error instanceof AuthzError) {
      return renderDenied(error.message);
    }
    throw error;
  }
}
