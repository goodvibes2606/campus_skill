import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import {
  listNotifications,
  countUnreadNotifications,
} from "@/lib/notifications";

/**
 * GET /api/notifications — notifications for the authenticated recipient only.
 * Query: ?unread=true&limit=50
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const notifications = await listNotifications(ctx, {
      unreadOnly,
      limit: Number(searchParams.get("limit") ?? 50) || 50,
    });
    const unreadCount = await countUnreadNotifications(ctx);
    return NextResponse.json({
      count: notifications.length,
      unreadCount,
      notifications: notifications.map((n) => ({
        id: n.id,
        event: n.event,
        title: n.title,
        body: n.body,
        priority: n.priority,
        isRead: n.is_read,
        readAt: n.read_at,
        createdAt: n.created_at,
        recipientId: n.recipient_id,
        recipientName: n.recipient_name,
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
        message: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
