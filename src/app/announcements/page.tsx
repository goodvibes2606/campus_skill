import { getAuthContext } from "@/lib/authz";
import { listAnnouncements } from "@/lib/announcements";
import { AnnouncementActions } from "@/components/announcements/announcement-actions";

export const metadata = {
  title: "Announcements | Campus Skill",
};

const STAFF = new Set([
  "admin",
  "director_dean",
  "hod",
  "faculty",
  "tpo",
]);

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return (
      <div className="placeholder-page">
        <h1>Sign in required</h1>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  const params = await searchParams;
  const canCreate = STAFF.has(ctx.roleName);
  const mine = params.mine === "1" && canCreate;

  let rows;
  try {
    rows = await listAnnouncements(ctx, {
      mine: mine || undefined,
      limit: 100,
    });
  } catch {
    return (
      <div className="placeholder-page">
        <p className="eyebrow">Announcements</p>
        <h1>Not available</h1>
        <p className="page-description">
          Announcements require an institution assignment.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Announcements</p>
          <h1>Announcements</h1>
          <p className="welcome-copy">
            {canCreate
              ? "Publish targeted updates. Audience scope is enforced on the server."
              : "Published announcements that match your role and enrollment."}
          </p>
        </div>
        {canCreate && (
          <div className="help-module-chips">
            <a
              className={`ai-chip ${!mine ? "ai-chip-active" : ""}`}
              href="/announcements"
            >
              Visible
            </a>
            <a
              className={`ai-chip ${mine ? "ai-chip-active" : ""}`}
              href="/announcements?mine=1"
            >
              Mine
            </a>
          </div>
        )}
      </section>

      {canCreate ? <AnnouncementActions roleName={ctx.roleName} /> : null}

      <section className="dash-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">feed</p>
            <h2>{rows.length} announcement{rows.length === 1 ? "" : "s"}</h2>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="empty-state">
            No announcements yet for your audience. Staff can publish the first
            one above.
          </p>
        ) : (
          <div className="dash-list">
            {rows.map((a) => (
              <article className="dash-row" key={a.id}>
                <div>
                  <strong>
                    {a.priority === "urgent" || a.priority === "high" ? (
                      <span className="status-pill" style={{ background: "#fdf0ec", color: "#a65a3c" }}>
                        {a.priority}
                      </span>
                    ) : null}{" "}
                    {a.title}
                  </strong>
                  <small>
                    {a.body.slice(0, 180)}
                    {a.body.length > 180 ? "…" : ""}
                  </small>
                  <small>
                    {a.audience_kind} · {a.status} · by {a.creator_name}
                    {a.published_at
                      ? ` · ${new Date(a.published_at).toLocaleDateString()}`
                      : ""}
                  </small>
                </div>
                <span className="status-pill">{a.audience_kind}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
