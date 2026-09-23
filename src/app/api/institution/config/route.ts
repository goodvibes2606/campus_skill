import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  InstitutionConfigValidationError,
  loadInstitutionWorkspace,
  updateInstitutionBranding,
  updateInstitutionContact,
  updateInstitutionOnboarding,
  updateInstitutionProfile,
  updateInstitutionPublicProfile,
} from "@/lib/institution-config";

/**
 * GET   /api/institution/config — load workspace config for caller's institution.
 * PATCH /api/institution/config — update a config area (admin only).
 * Body: { area: profile|contact|branding|public_profile|onboarding, ...fields }
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const data = await loadInstitutionWorkspace(ctx);
    return NextResponse.json({
      institution: data.institution,
      config: data.config,
      moduleCount: data.moduleCount,
      pendingChangeCount: data.pendingChangeCount,
      onboardingPercent: data.onboardingPercent,
      canConfigure: data.scope.canConfigure,
      canApprove: data.scope.canApprove,
      canViewAudit: data.scope.canViewAudit,
      canImport: data.scope.canImport,
      access: data.scope.access,
    });
  } catch (error) {
    return handleErr(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const body = await request.json();
    const area = String(body.area ?? "");

    let updated;
    if (area === "profile") {
      updated = await updateInstitutionProfile(ctx, {
        shortName: body.shortName,
        institutionType: body.institutionType,
        about: body.about,
        logoUrl: body.logoUrl,
        coverImageUrl: body.coverImageUrl,
        establishedYear: body.establishedYear,
        accreditation: body.accreditation,
        affiliation: body.affiliation,
      });
    } else if (area === "contact") {
      updated = await updateInstitutionContact(ctx, {
        address: body.address,
        city: body.city,
        state: body.state,
        country: body.country,
        mapsUrl: body.mapsUrl,
        websiteUrl: body.websiteUrl,
        officialEmail: body.officialEmail,
        admissionEmail: body.admissionEmail,
        supportEmail: body.supportEmail,
        phone: body.phone,
        contactPersonName: body.contactPersonName,
        contactPersonTitle: body.contactPersonTitle,
        socialInstagram: body.socialInstagram,
        socialFacebook: body.socialFacebook,
        socialLinkedin: body.socialLinkedin,
        socialYoutube: body.socialYoutube,
        socialX: body.socialX,
      });
    } else if (area === "branding") {
      updated = await updateInstitutionBranding(ctx, {
        primaryColor: body.primaryColor,
        secondaryColor: body.secondaryColor,
        faviconUrl: body.faviconUrl,
        loginTagline: body.loginTagline,
        dashboardTagline: body.dashboardTagline,
      });
    } else if (area === "public_profile") {
      updated = await updateInstitutionPublicProfile(ctx, {
        publicProfile:
          body.publicProfile && typeof body.publicProfile === "object"
            ? body.publicProfile
            : {},
      });
    } else if (area === "onboarding") {
      updated = await updateInstitutionOnboarding(ctx, {
        onboardingStatus: body.onboardingStatus,
        onboardingStep:
          body.onboardingStep !== undefined
            ? Number(body.onboardingStep)
            : undefined,
      });
    } else {
      return NextResponse.json(
        { error: "VALIDATION", message: "Unknown config area" },
        { status: 400 }
      );
    }

    return NextResponse.json({ config: updated });
  } catch (error) {
    return handleErr(error);
  }
}

function handleErr(error: unknown) {
  if (error instanceof InstitutionConfigValidationError) {
    return NextResponse.json(
      { error: "VALIDATION", message: error.message },
      { status: 400 }
    );
  }
  if (error instanceof AuthzError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }
  return NextResponse.json(
    {
      error: "server_error",
      message: error instanceof Error ? error.message : "unknown",
    },
    { status: 500 }
  );
}
