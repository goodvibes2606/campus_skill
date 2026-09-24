import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import {
  listEnrolledSubjects,
  listOwnSubmissions,
} from "@/lib/student-academics";
import { listVisibleAssignments } from "@/lib/assignments";

/**
 * My Subjects — student academic hub (Milestone 8).
 * Enrolled subjects come only from the server-side active enrollment section.
 */
export default async function SubjectsPage() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Student academics</p>
            <h1>Sign in to view subjects</h1>
            <p className="page-description">
              Your enrolled subjects appear only inside your authorized
              academic scope.
            </p>
          </div>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  if (ctx.roleName !== "student") {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Student academics</p>
            <h1>Student subjects</h1>
            <p className="page-description">
              This workspace is for the student role. Use your role dashboard
              for faculty, HOD, or administration views.
            </p>
          </div>
        </div>
        <section className="coming-soon-panel">
          <div className="panel-line" />
          <p className="panel-label">Access</p>
          <h2>Student workspace only</h2>
          <p>
            Server-side authorization limits this page to enrolled students.
          </p>
          <Link className="text-link" href="/">
            Back to dashboard <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </div>
    );
  }

  const { subjects, enrollment } = await listEnrolledSubjects(ctx);

  let pendingTotal = 0;
  if (enrollment) {
    const [assignments, own] = await Promise.all([
      listVisibleAssignments(ctx, { limit: 100 }),
      listOwnSubmissions(ctx),
    ]);
    const byAssignment = new Map(own.map((s) => [s.assignment_id, s]));
    pendingTotal = assignments.filter((a) => {
      const sub = byAssignment.get(a.id);
      if (!sub) return true;
      return sub.status === "draft" || sub.status === "returned";
    }).length;
  }

  const contextLine = enrollment
    ? `${enrollment.program_name} · ${enrollment.section_name} · Sem ${enrollment.semester_number} · ${enrollment.academic_year_name}`
    : "No active enrollment — subjects appear once you are assigned to a section.";

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Student academics</p>
          <h1>My subjects</h1>
          <p className="welcome-copy">{contextLine}</p>
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
          <strong>{subjects.length}</strong>
          <span>Enrolled subjects</span>
        </div>
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-orange" aria-hidden="true">
            ✓
          </span>
          <strong>{pendingTotal}</strong>
          <span>Pending submissions</span>
        </div>
        <div className="overview-card stat-card">
          <span className="stat-icon stat-icon-teal" aria-hidden="true">
            ◎
          </span>
          <strong>{enrollment ? enrollment.section_name : "—"}</strong>
          <span>Active section</span>
        </div>
      </section>

      {!enrollment ? (
        <section className="content-section" aria-label="Enrollment">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Enrollment</p>
              <h2>No active enrollment</h2>
            </div>
          </div>
          <p className="empty-state">
            You are not enrolled in a section yet. Subjects, assignments, and
            resources will appear here once an administrator or coordinator
            enrolls you.
          </p>
        </section>
      ) : subjects.length === 0 ? (
        <section className="content-section" aria-label="Subjects">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Subjects</p>
              <h2>No subjects linked yet</h2>
            </div>
          </div>
          <p className="empty-state">
            Your section has no active subject links yet. Check back after the
            academic schedule is published.
          </p>
        </section>
      ) : (
        <section className="content-section" aria-label="Enrolled subjects">
          <div className="section-heading">
            <div>
              <p className="eyebrow">This semester</p>
              <h2>Enrolled subjects</h2>
            </div>
            <span className="section-note">
              {subjects.length} subject{subjects.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="dash-grid" style={{ marginTop: 19 }}>
            {subjects.map((s) => (
              <Link className="dash-panel" href={`/subjects/${s.id}`} key={s.id}>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">{s.subject_code}</p>
                    <h2>{s.name}</h2>
                  </div>
                  <span className="activity-arrow" aria-hidden="true">
                    ›
                  </span>
                </div>
                <div className="dash-list">
                  <div className="dash-row">
                    <div>
                      <strong>
                        {s.faculty_name ? `Faculty: ${s.faculty_name}` : "No faculty assigned"}
                      </strong>
                      <small>
                        Open subject workspace for assignments, notes, syllabus
                        &amp; assessments
                      </small>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="content-section" aria-label="Quick links">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Move forward</p>
            <h2>Quick access</h2>
          </div>
        </div>
        <div className="quick-grid">
          <Link className="quick-card quick-card-gold" href="/assignments">
            <span className="quick-icon" aria-hidden="true">
              ✓
            </span>
            <span>
              <strong>Assignments</strong>
              <small>Work, papers, and MSTs</small>
            </span>
            <span className="arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
          <Link className="quick-card quick-card-blue" href="/notes">
            <span className="quick-icon" aria-hidden="true">
              ▤
            </span>
            <span>
              <strong>Notes &amp; resources</strong>
              <small>Study materials for your section</small>
            </span>
            <span className="arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
          <Link className="quick-card quick-card-green" href="/syllabus">
            <span className="quick-icon" aria-hidden="true">
              ✦
            </span>
            <span>
              <strong>Syllabus</strong>
              <small>Units and topics</small>
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
