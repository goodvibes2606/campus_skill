import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { listTopics, createTopic } from "@/lib/syllabus";
import { AcademicOpsValidationError } from "@/lib/academic-ops-types";

/**
 * GET  /api/syllabus-units/[id]/topics — list topics under a unit.
 * POST /api/syllabus-units/[id]/topics — add topic (editor roles only).
 *
 * Body: { topicNumber?, title, description? }
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
    const topics = await listTopics(auth, id);
    return NextResponse.json({
      count: topics.length,
      topics: topics.map(mapTopic),
    });
  } catch (error) {
    return handleErr(error);
  }
}

export async function POST(
  request: Request,
  routeCtx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await routeCtx.params;
    const body = await request.json();
    const topic = await createTopic(auth, id, {
      topicNumber:
        body.topicNumber === undefined || body.topicNumber === null
          ? undefined
          : Number(body.topicNumber),
      title: String(body.title ?? ""),
      description: body.description ? String(body.description) : "",
    });
    return NextResponse.json({ topic: mapTopic(topic) }, { status: 201 });
  } catch (error) {
    return handleErr(error);
  }
}

function mapTopic(t: {
  id: string;
  unit_id: string;
  syllabus_id: string;
  topic_number: number;
  title: string;
  description: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: t.id,
    unitId: t.unit_id,
    syllabusId: t.syllabus_id,
    topicNumber: t.topic_number,
    title: t.title,
    description: t.description,
    status: t.status,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

function handleErr(error: unknown) {
  if (error instanceof AcademicOpsValidationError) {
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
