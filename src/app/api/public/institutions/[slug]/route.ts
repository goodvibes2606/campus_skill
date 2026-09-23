import { NextResponse } from "next/server";

import { getPublicInstitutionBySlug } from "@/lib/public-institution";

/**
 * GET /api/public/institutions/[slug] — public institution profile.
 * Only fields explicitly marked public by the institution admin.
 * Name + slug are always public (directory listing). No internal config.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const profile = await getPublicInstitutionBySlug(slug);
    if (!profile) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Institution not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      institution: {
        slug: profile.slug,
        name: profile.name,
        publicProfile: profile.publicProfile,
        logoUrl: profile.logoUrl,
        primaryColor: profile.primaryColor,
        secondaryColor: profile.secondaryColor,
        websiteUrl: profile.websiteUrl,
        city: profile.city,
        country: profile.country,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "server_error", message: "unknown" },
      { status: 500 }
    );
  }
}
