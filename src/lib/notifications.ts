import { pool } from "@/lib/db";
import {
  AuthzError,
  requireInstitution,
  type AuthContext,
} from "@/lib/authz";
import {
  AcademicOpsValidationError,
  isNotificationPriority,
  type NotificationPriority,
} from "@/lib/academic-ops-types";
import { enqueueChannelDeliveries } from "@/lib/notification-channels";

/**
 * Core notification model (Milestone 5).
 * Fields: event, recipient, read/unread, priority, timestamp.
 * Channels are NOT part of this model — see notification-channels.ts.
 */

export type NotificationRow = {
  id: string;
  institution_id: string | null;
  recipient_id: string;
  event: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type NotificationView = NotificationRow & {
  recipient_name: string;
  is_read: boolean;
};

export type CreateNotificationInput = {
  recipientId: string;
  event: string;
  title: string;
  body?: string;
  priority?: string;
  institutionId?: string | null;
  /** When true, skip insert if recipientId === ctx.userId */
  skipSelf?: boolean;
};

function validateNotificationInput(input: CreateNotificationInput): void {
  const event = (input.event || "").trim();
  if (event.length < 3 || event.length > 80) {
    throw new AcademicOpsValidationError(
      "event must be 3–80 characters (e.g. syllabus.status_changed)"
    );
  }
  if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(event)) {
    throw new AcademicOpsValidationError(
      "event must look like domain.action (letters/digits/underscore)"
    );
  }
  const title = (input.title || "").trim();
  if (title.length < 2 || title.length > 200) {
    throw new AcademicOpsValidationError("title must be 2–200 characters");
  }
  if (input.priority !== undefined && !isNotificationPriority(input.priority)) {
    throw new AcademicOpsValidationError("Invalid priority");
  }
}

/**
 * Create one in-app notification for a recipient.
 * Delivery channels are enqueued independently (never hard-coded here).
 */
export async function createNotification(
  ctx: AuthContext,
  input: CreateNotificationInput
): Promise<NotificationRow | null> {
  validateNotificationInput(input);

  if (input.skipSelf && input.recipientId === ctx.userId) {
    return null;
  }

  const recipient = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM public.profiles WHERE id = $1`,
    [input.recipientId]
  );
  if (!recipient.rows[0] || recipient.rows[0].status !== "active") {
    // Silently skip inactive/missing recipients (foundation behavior)
    return null;
  }

  const institutionId =
    input.institutionId !== undefined
      ? input.institutionId
      : ctx.institutionId;

  const priority: NotificationPriority =
    input.priority && isNotificationPriority(input.priority)
      ? input.priority
      : "normal";

  const inserted = await pool.query<NotificationRow>(
    `INSERT INTO public.notifications (
        institution_id, recipient_id, event, title, body, priority
     ) VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      institutionId,
      input.recipientId,
      input.event.trim(),
      input.title.trim(),
      (input.body || "").trim().slice(0, 2000),
      priority,
    ]
  );

  const row = inserted.rows[0];
  await enqueueChannelDeliveries(row, ["in_app"]);
  return row;
}

export type NotifyInstitutionInput = {
  institutionId: string;
  event: string;
  title: string;
  body?: string;
  priority?: string;
  excludeUserId?: string;
  createdBy: string;
  /** Optional role names to filter; default = all active profiles */
  roleNames?: string[];
};

/**
 * Fan-out helper for circulation (e.g. calendar publish).
 * Creates one notification per active profile in the institution.
 */
export async function notifyInstitution(
  input: NotifyInstitutionInput
): Promise<number> {
  validateNotificationInput({
    recipientId: "placeholder",
    event: input.event,
    title: input.title,
    body: input.body,
    priority: input.priority,
  });

  const params: unknown[] = [input.institutionId];
  let roleFilter = "";
  if (input.roleNames && input.roleNames.length > 0) {
    params.push(input.roleNames);
    roleFilter = `AND r.name = ANY($${params.length}::text[])`;
  }

  const profiles = await pool.query<{ id: string }>(
    `SELECT p.id
       FROM public.profiles p
       JOIN public.roles r ON r.id = p.role_id
      WHERE p.institution_id = $1
        AND p.status = 'active'${roleFilter}`,
    params
  );

  const priority: NotificationPriority =
    input.priority && isNotificationPriority(input.priority)
      ? input.priority
      : "normal";

  let count = 0;
  for (const profile of profiles.rows) {
    if (input.excludeUserId && profile.id === input.excludeUserId) continue;
    const inserted = await pool.query<NotificationRow>(
      `INSERT INTO public.notifications (
          institution_id, recipient_id, event, title, body, priority
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        input.institutionId,
        profile.id,
        input.event,
        input.title,
        (input.body || "").trim().slice(0, 2000),
        priority,
      ]
    );
    await enqueueChannelDeliveries(inserted.rows[0], ["in_app"]);
    count += 1;
  }
  return count;
}

export type ListNotificationsQuery = {
  unreadOnly?: boolean;
  limit?: number;
};

export async function listNotifications(
  ctx: AuthContext,
  query: ListNotificationsQuery = {}
): Promise<NotificationView[]> {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const params: unknown[] = [ctx.userId];
  let unreadClause = "";
  if (query.unreadOnly) {
    unreadClause = "AND n.read_at IS NULL";
  }

  const result = await pool.query<NotificationView>(
    `SELECT n.*,
            p.full_name AS recipient_name,
            (n.read_at IS NOT NULL) AS is_read
       FROM public.notifications n
       JOIN public.profiles p ON p.id = n.recipient_id
      WHERE n.recipient_id = $1 ${unreadClause}
      ORDER BY n.created_at DESC
      LIMIT ${limit}`,
    params
  );
  return result.rows;
}

export async function countUnreadNotifications(
  ctx: AuthContext
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM public.notifications
      WHERE recipient_id = $1 AND read_at IS NULL`,
    [ctx.userId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Mark a notification read/unread. Recipient-only (server-side check).
 */
export async function markNotificationRead(
  ctx: AuthContext,
  notificationId: string,
  read: boolean
): Promise<NotificationView> {
  const row = await pool.query<NotificationRow>(
    `SELECT * FROM public.notifications WHERE id = $1`,
    [notificationId]
  );
  const note = row.rows[0];
  if (!note) {
    throw new AuthzError("FORBIDDEN", "Notification not found");
  }
  if (note.recipient_id !== ctx.userId) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only the recipient may update this notification"
    );
  }

  await pool.query(
    `UPDATE public.notifications
        SET read_at = ${read ? "COALESCE(read_at, now())" : "NULL"},
            updated_at = now()
      WHERE id = $1`,
    [notificationId]
  );

  const view = await pool.query<NotificationView>(
    `SELECT n.*,
            p.full_name AS recipient_name,
            (n.read_at IS NOT NULL) AS is_read
       FROM public.notifications n
       JOIN public.profiles p ON p.id = n.recipient_id
      WHERE n.id = $1`,
    [notificationId]
  );
  const out = view.rows[0];
  if (!out) {
    throw new AuthzError("FORBIDDEN", "Notification not found");
  }
  return out;
}

/** Optional helper: require institution for institutional fan-outs. */
export function requireInstitutionId(ctx: AuthContext): string {
  return requireInstitution(ctx);
}
