import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { listSyllabusVersions } from "@/lib/syllabus";

/**
 * GET /api/syllabi/[id]/versions — immutable syllabus version snapshots.
 */
export async function GET(
  _request: Request,
  routeCtx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await routeCtx.params;
    const versions = await listSyllabusVersions(auth, id);
    return NextResponse.json({
      count: versions.length,
      versions: versions.map((v) => ({
        id: v.id,
        syllabusId: v.syllabus_id,
        version: v.version,
        status: v.status,
        title: v.title,
        description: v.description,
        sourceType: v.source_type,
        sourceReference: v.source_reference,
        sourceNotes: v.source_notes,
        sourceIsOfficial: v.source_is_official,
        changeNote: v.change_note,
        snapshotBy: v.snapshot_by,
        createdAt: v.created_at,
      })),
    });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }
    return NextResponse.json(
      {
        error: "server_error",
        message: "Something went wrong. Try again.",
      },
      { status: 500 }
    );
  }
}
