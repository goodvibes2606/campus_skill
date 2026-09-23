import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  getCareerProfile,
  listCareerProfiles,
  upsertCareerProfile,
} from "@/lib/placement-profile";
import { PlacementValidationError } from "@/lib/placement-types";

/**
 * GET  /api/placement/profile — own (student) or list (staff).
 *      Query: ?studentId= (staff) | ?mine=true | ?readiness=
 * POST /api/placement/profile — upsert own career profile (student only).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const listMode =
      searchParams.get("list") === "true" || searchParams.get("readiness");

    if (listMode) {
      const profiles = await listCareerProfiles(ctx, {
        readiness: searchParams.get("readiness") ?? undefined,
        mine: searchParams.get("mine") === "true",
        limit: Number(searchParams.get("limit") ?? 50) || 50,
      });
      return NextResponse.json({
        count: profiles.length,
        profiles: profiles.map(toPublicView),
      });
    }

    const profile = await getCareerProfile(ctx, studentId ?? undefined);
    return NextResponse.json({
      profile: profile ? toPublicView(profile) : null,
    });
  } catch (error) {
    return handleErr(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const body = await request.json();
    const profile = await upsertCareerProfile(ctx, {
      headline: body.headline !== undefined ? String(body.headline) : undefined,
      summary: body.summary !== undefined ? String(body.summary) : undefined,
      skills: body.skills,
      careerInterests: body.careerInterests,
      resumeReference:
        body.resumeReference !== undefined
          ? body.resumeReference
            ? String(body.resumeReference)
            : null
          : undefined,
      readiness:
        body.readiness !== undefined ? String(body.readiness) : undefined,
    });
    return NextResponse.json({ profile: toPublicView(profile) }, { status: 201 });
  } catch (error) {
    return handleErr(error);
  }
}

function toPublicView(p: Record<string, unknown>) {
  return {
    id: p.id,
    studentId: p.student_id,
    studentName: p.student_name,
    studentEmail: p.student_email,
    headline: p.headline,
    summary: p.summary,
    skills: p.skills ?? [],
    careerInterests: p.career_interests ?? [],
    resumeReference: p.resume_reference,
    readiness: p.readiness,
    enrollmentContext: p.enrollment_context ?? null,
    isOwn: p.is_own ?? false,
    updatedAt: p.updated_at,
    createdAt: p.created_at,
  };
}

function handleErr(error: unknown) {
  if (error instanceof PlacementValidationError) {
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
