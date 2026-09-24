import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/authz";
import { mapApiError, unauthenticated } from "@/lib/api-errors";
import {
  createAnnouncement,
  listAnnouncements,
  publishAnnouncement,
} from "@/lib/announcements";

/**
 * GET  /api/announcements — audience-filtered list for caller.
 * POST /api/announcements — create (optional publish: true).
 * PATCH /api/announcements — { id, action: "publish" } publish draft.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const { searchParams } = new URL(request.url);
    const rows = await listAnnouncements(ctx, {
      status: searchParams.get("status") ?? undefined,
      mine: searchParams.get("mine") === "true",
      limit: Number(searchParams.get("limit") ?? 50) || 50,
    });
    return NextResponse.json({
      count: rows.length,
      announcements: rows.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        priority: a.priority,
        status: a.status,
        audienceKind: a.audience_kind,
        departmentId: a.department_id,
        sectionId: a.section_id,
        programId: a.program_id,
        startAt: a.start_at,
        endAt: a.end_at,
        createdBy: a.created_by,
        creatorName: a.creator_name,
        publishedAt: a.published_at,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const body = (await request.json()) as Record<string, unknown>;
    const created = await createAnnouncement(ctx, {
      title: String(body.title ?? ""),
      body: body.body !== undefined ? String(body.body) : "",
      priority: body.priority !== undefined ? String(body.priority) : undefined,
      audienceKind:
        body.audienceKind !== undefined ? String(body.audienceKind) : undefined,
      departmentId: body.departmentId ? String(body.departmentId) : null,
      programId: body.programId ? String(body.programId) : null,
      semesterId: body.semesterId ? String(body.semesterId) : null,
      sectionId: body.sectionId ? String(body.sectionId) : null,
      startAt: body.startAt ? String(body.startAt) : null,
      endAt: body.endAt ? String(body.endAt) : null,
      publish: Boolean(body.publish),
      notifyRecipients:
        body.notifyRecipients === undefined
          ? undefined
          : Boolean(body.notifyRecipients),
    });
    return NextResponse.json({ announcement: mapOne(created) }, { status: 201 });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const body = (await request.json()) as { id?: string; action?: string };
    if (!body.id) {
      return NextResponse.json(
        { error: "VALIDATION", message: "id is required" },
        { status: 400 }
      );
    }
    if (body.action === "publish") {
      const row = await publishAnnouncement(ctx, body.id);
      return NextResponse.json({ announcement: mapOne(row) });
    }
    return NextResponse.json(
      { error: "VALIDATION", message: 'action must be "publish"' },
      { status: 400 }
    );
  } catch (error) {
    return mapApiError(error);
  }
}

function mapOne(a: {
  id: string;
  title: string;
  body: string;
  priority: string;
  status: string;
  audience_kind: string;
  created_at: Date;
  published_at: Date | null;
  creator_name?: string;
}) {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    priority: a.priority,
    status: a.status,
    audienceKind: a.audience_kind,
    publishedAt: a.published_at,
    createdAt: a.created_at,
    creatorName: a.creator_name ?? null,
  };
}
