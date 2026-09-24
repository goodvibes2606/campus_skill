import { getAuthContext } from "@/lib/authz";
import { loadInstitutionWorkspace } from "@/lib/institution-config";
import { InstitutionConfigForm } from "@/components/institution/config-form";
import { assertCanReadInstitutionWorkspace } from "@/lib/institution-scope";

export default async function InstitutionProfilePage() {
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
    assertCanReadInstitutionWorkspace(data.scope);
  } catch {
    return (
      <div className="placeholder-page">
        <p className="eyebrow">Institution workspace</p>
        <h1>Not available for your role</h1>
        <p>Limited to institution admin, Director/Dean, and system administration.</p>
      </div>
    );
  }

  const { config, scope, institution } = data;
  const readOnly = !scope.canConfigure;

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Profile &amp; contact</p>
          <h1>{institution.name}</h1>
          <p className="welcome-copy">
            Internal institution profile. Mark public fields under Public page.
          </p>
        </div>
      </section>

      <InstitutionConfigForm
        area="profile"
        title="Profile"
        description="Identity fields shown inside the authenticated workspace."
        readOnly={readOnly}
        initial={{
          shortName: config.short_name,
          institutionType: config.institution_type,
          about: config.about,
          logoUrl: config.logo_url,
          coverImageUrl: config.cover_image_url,
          establishedYear: config.established_year,
          accreditation: config.accreditation,
          affiliation: config.affiliation,
        }}
        fields={[
          { key: "shortName", label: "Short name", maxLength: 40 },
          { key: "institutionType", label: "Type", placeholder: "University / College / Institute", maxLength: 80 },
          { key: "about", label: "About", type: "textarea", maxLength: 4000 },
          { key: "logoUrl", label: "Logo URL", type: "url", maxLength: 500 },
          { key: "coverImageUrl", label: "Cover image URL", type: "url", maxLength: 500 },
          { key: "establishedYear", label: "Established year", type: "number" },
          { key: "accreditation", label: "Accreditation", maxLength: 300 },
          { key: "affiliation", label: "Affiliation", maxLength: 300 },
        ]}
      />

      <InstitutionConfigForm
        area="contact"
        title="Contact & social"
        description="Official contact channels and social links."
        readOnly={readOnly}
        initial={{
          address: config.address,
          city: config.city,
          state: config.state,
          country: config.country,
          mapsUrl: config.maps_url,
          websiteUrl: config.website_url,
          officialEmail: config.official_email,
          admissionEmail: config.admission_email,
          supportEmail: config.support_email,
          phone: config.phone,
          contactPersonName: config.contact_person_name,
          contactPersonTitle: config.contact_person_title,
          socialInstagram: config.social_instagram,
          socialFacebook: config.social_facebook,
          socialLinkedin: config.social_linkedin,
          socialYoutube: config.social_youtube,
          socialX: config.social_x,
        }}
        fields={[
          { key: "address", label: "Address", type: "textarea", maxLength: 500 },
          { key: "city", label: "City", maxLength: 100 },
          { key: "state", label: "State / Province", maxLength: 100 },
          { key: "country", label: "Country", maxLength: 100 },
          { key: "mapsUrl", label: "Maps link", type: "url", maxLength: 500 },
          { key: "websiteUrl", label: "Website", type: "url", maxLength: 500 },
          { key: "officialEmail", label: "Official email", type: "email", maxLength: 200 },
          { key: "admissionEmail", label: "Admission email", type: "email", maxLength: 200 },
          { key: "supportEmail", label: "Support email", type: "email", maxLength: 200 },
          { key: "phone", label: "Phone", maxLength: 50 },
          { key: "contactPersonName", label: "Contact person", maxLength: 120 },
          { key: "contactPersonTitle", label: "Contact title", maxLength: 120 },
          { key: "socialInstagram", label: "Instagram", type: "url", maxLength: 300 },
          { key: "socialFacebook", label: "Facebook", type: "url", maxLength: 300 },
          { key: "socialLinkedin", label: "LinkedIn", type: "url", maxLength: 300 },
          { key: "socialYoutube", label: "YouTube", type: "url", maxLength: 300 },
          { key: "socialX", label: "X (Twitter)", type: "url", maxLength: 300 },
        ]}
      />
    </div>
  );
}
