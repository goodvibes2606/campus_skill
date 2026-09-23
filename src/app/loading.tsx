/**
 * Route-level loading state (Milestone 7).
 * Shown while server components (dashboard/data) resolve.
 */
export default function Loading() {
  return (
    <div className="dashboard-page" aria-busy="true" aria-live="polite">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Loading</p>
          <h1>Preparing your workspace…</h1>
          <p className="welcome-copy">
            Fetching authorized academic data for your role.
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span>✦</span>
        </div>
      </section>
      <section className="overview-grid" aria-hidden="true">
        <div className="overview-card stat-card skeleton-card">
          <span className="skeleton-line skeleton-line-lg" />
          <span className="skeleton-line" />
        </div>
        <div className="overview-card stat-card skeleton-card">
          <span className="skeleton-line skeleton-line-lg" />
          <span className="skeleton-line" />
        </div>
        <div className="overview-card stat-card skeleton-card">
          <span className="skeleton-line skeleton-line-lg" />
          <span className="skeleton-line" />
        </div>
      </section>
      <section className="dash-grid" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div className="dash-panel skeleton-card" key={i}>
            <span className="skeleton-line skeleton-line-md" />
            <span className="skeleton-line" />
            <span className="skeleton-line" />
            <span className="skeleton-line skeleton-line-sm" />
          </div>
        ))}
      </section>
    </div>
  );
}
