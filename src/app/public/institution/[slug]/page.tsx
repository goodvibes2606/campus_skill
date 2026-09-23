import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicInstitutionBySlug } from "@/lib/public-institution";

/**
 * Public institution page (Milestone 11).
 * Route prefix /public is in proxy PUBLIC_PREFIXES — no session required.
 * Renders only name, slug, and explicitly public fields.
 */
export default async function PublicInstitutionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getPublicInstitutionBySlug(slug);
  if (!profile) notFound();

  const pub = profile.publicProfile ?? {};
  const rows: { label: string; value: unknown; href?: string }[] = [
    { label: "About", value: pub.about },
    { label: "Type", value: pub.institutionType },
    { label: "Established", value: pub.establishedYear },
    { label: "Accreditation", value: pub.accreditation },
    { label: "Address", value: pub.address },
    { label: "City", value: pub.city },
    { label: "State", value: pub.state },
    { label: "Country", value: pub.country },
    { label: "Official email", value: pub.officialEmail },
    { label: "Admission email", value: pub.admissionEmail },
    { label: "Support email", value: pub.supportEmail },
    { label: "Phone", value: pub.phone },
    {
      label: "Website",
      value: pub.website ?? profile.websiteUrl,
      href: (pub.website as string) || profile.websiteUrl || undefined,
    },
    {
      label: "Maps",
      value: pub.mapsUrl ? "Open map" : null,
      href: (pub.mapsUrl as string) || undefined,
    },
    {
      label: "Contact person",
      value: [pub.contactPersonName, pub.contactPersonTitle]
        .filter(Boolean)
        .join(", ") || null,
    },
  ].filter((r) => r.value !== null && r.value !== undefined && r.value !== "");

  return (
    <div className="dashboard-page public-institution-page">
      <section
        className="welcome-section public-brand-hero"
        style={
          profile.primaryColor
            ? ({ "--brand-primary": profile.primaryColor } as React.CSSProperties)
            : undefined
        }
      >
        <div className="public-brand-lockup">
          {profile.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logoUrl}
              alt=""
              className="public-logo"
              width={64}
              height={64}
            />
          ) : (
            <div className="brand-mark" aria-hidden="true">
              {profile.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="eyebrow">Public institution profile</p>
            <h1>{profile.name}</h1>
            <p className="welcome-copy">
              {profile.city || profile.country
                ? [profile.city, profile.country].filter(Boolean).join(", ")
                : profile.slug}
            </p>
          </div>
        </div>
      </section>

      <section className="dash-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">directory</p>
            <h2>Published information</h2>
            <p className="page-description">
              Only fields the institution has explicitly published. Internal
              configuration is never exposed here.
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="placement-muted">
            This institution has not published additional fields yet — only its
            name is listed.
          </p>
        ) : (
          <dl className="inst-public-rows">
            {rows.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>
                  {r.href ? (
                    <a href={r.href} target="_blank" rel="noreferrer">
                      {String(r.value)}
                    </a>
                  ) : (
                    String(r.value)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <p className="placement-muted">
        Powered by <strong>Campus Skill</strong> ·{" "}
        <Link className="text-link" href="/public">
          All institutions
        </Link>
      </p>
    </div>
  );
}
