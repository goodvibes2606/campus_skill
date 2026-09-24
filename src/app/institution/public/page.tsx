import { getAuthContext } from "@/lib/authz";
import { loadInstitutionWorkspace } from "@/lib/institution-config";
import { PublicProfileToggles } from "@/components/institution/public-profile-toggles";

export default async function InstitutionPublicPage() {
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

  let data;
  try {
    data = await loadInstitutionWorkspace(ctx);
  } catch {
    return (
      <div className="placeholder-page">
        <p className="eyebrow">Institution workspace</p>
        <h1>Not available for your role</h1>
      </div>
    );
  }

  const { config, scope, institution } = data;

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Public page</p>
          <h1>Public directory profile</h1>
          <p className="welcome-copy">
            Choose which fields are exposed at{" "}
            <code>/public/institution/{institution.slug}</code>. Unchecked
            fields never leave the authenticated workspace.
          </p>
        </div>
      </section>

      <PublicProfileToggles
        publicProfile={config.public_profile ?? {}}
        logoUrl={config.logo_url}
        about={config.about}
        officialEmail={config.official_email}
        phone={config.phone}
        address={config.address}
        city={config.city}
        state={config.state}
        country={config.country}
        websiteUrl={config.website_url}
        mapsUrl={config.maps_url}
        shortName={config.short_name}
        institutionType={config.institution_type}
        establishedYear={config.established_year}
        accreditation={config.accreditation}
        contactPersonName={config.contact_person_name}
        contactPersonTitle={config.contact_person_title}
        supportEmail={config.support_email}
        admissionEmail={config.admission_email}
        readOnly={!scope.canConfigure}
      />
    </div>
  );
}
