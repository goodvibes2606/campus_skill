import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { markNotificationRead } from "@/lib/notifications";

/**
 * PATCH /api/notifications/[id] — mark read/unread (recipient only).
 *
 * Body: { read: boolean }
 */
export async function PATCH(
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
    const read = body.read !== false;
    const n = await markNotificationRead(auth, id, read);
    return NextResponse.json({
      notification: {
        id: n.id,
        event: n.event,
        title: n.title,
        body: n.body,
        priority: n.priority,
        isRead: n.is_read,
        readAt: n.read_at,
        createdAt: n.created_at,
      },
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
