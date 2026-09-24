export default function Loading() {
  return (
    <div className="dashboard-page" aria-busy="true" aria-live="polite">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Loading</p>
          <h1>Announcements…</h1>
        </div>
      </section>
      <section className="dash-panel skeleton-card" aria-hidden="true">
        <span className="skeleton-line skeleton-line-md" />
        <span className="skeleton-line" />
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-line-sm" />
      </section>
    </div>
  );
}
