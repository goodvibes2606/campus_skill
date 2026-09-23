import Link from "next/link";

import { listPublicInstitutions } from "@/lib/public-institution";

/**
 * Public institution directory (Milestone 11).
 * Name, slug, optional city/logo only — no internal config.
 */
export default async function PublicInstitutionsPage() {
  const institutions = await listPublicInstitutions(100);

  return (
    <div className="dashboard-page public-institution-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Campus Skill directory</p>
          <h1>Institutions</h1>
          <p className="welcome-copy">
            Public profiles published by institution administrators. Platform
            identity: Campus Skill.
          </p>
        </div>
      </section>

      <div className="inst-card-grid">
        {institutions.length === 0 ? (
          <div className="inst-card">
            <h3>No institutions listed yet</h3>
            <p>
              Administrators can publish a public profile from Institution
              Control Center → Public page.
            </p>
          </div>
        ) : (
          institutions.map((i) => (
            <Link
              className="inst-card"
              href={`/public/institution/${i.slug}`}
              key={i.slug}
            >
              <h3>{i.name}</h3>
              <p className="placement-muted">
                {i.city || i.slug}
              </p>
              <span className="text-link">
                View profile <span aria-hidden="true">↗</span>
              </span>
            </Link>
          ))
        )}
      </div>

      <p className="placement-muted">
        <Link className="text-link" href="/sign-in">
          Sign in for the full workspace
        </Link>
      </p>
    </div>
  );
}
