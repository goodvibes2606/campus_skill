export default function Loading() {
  return (
    <div className="dashboard-page" aria-busy="true" aria-live="polite">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Loading</p>
          <h1>Institution workspace…</h1>
        </div>
      </section>
      <section className="inst-card-grid" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div className="inst-card skeleton-card" key={i}>
            <span className="skeleton-line skeleton-line-md" />
            <span className="skeleton-line" />
            <span className="skeleton-line skeleton-line-sm" />
          </div>
        ))}
      </section>
    </div>
  );
}
