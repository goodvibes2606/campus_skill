"use client";

import Link from "next/link";

/**
 * Root error boundary (Milestone 7).
 * Catches unexpected render/data failures with a clear recovery path.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="placeholder-page" role="alert">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Something went wrong</p>
          <h1>We could not open this page</h1>
          <p className="page-description">
            An unexpected error occurred while loading authorized data. Your
            session and data were not changed.
          </p>
        </div>
        <div className="placeholder-seal" aria-hidden="true">
          !
        </div>
      </div>
      <section className="coming-soon-panel">
        <div className="panel-line" />
        <p className="panel-label">Error</p>
        <h2>Try again in a moment</h2>
        <p>
          {error?.message
            ? error.message
            : "No additional detail is available."}
          {error?.digest ? ` (ref ${error.digest})` : ""}
        </p>
        <div className="auth-actions-row">
          <button className="auth-submit" type="button" onClick={reset}>
            Try again
          </button>
          <Link className="text-link" href="/">
            Back to dashboard <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
