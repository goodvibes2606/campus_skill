import { NextResponse } from "next/server";

import { listPublicInstitutions } from "@/lib/public-institution";

/**
 * GET /api/public/institutions — public directory (name, slug, optional city/logo).
 * No session required. Never exposes internal config, emails, or module flags.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? 50) || 50;
    const institutions = await listPublicInstitutions(limit);
    return NextResponse.json({
      count: institutions.length,
      institutions: institutions.map((i) => ({
        slug: i.slug,
        name: i.name,
        logoUrl: i.logoUrl,
        city: i.city,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "server_error", message: "unknown" },
      { status: 500 }
    );
  }
}
