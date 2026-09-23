import { pool } from "@/lib/db";
import type { NotificationRow } from "@/lib/notifications";

/**
 * Notification delivery channels — intentionally separate from the core
 * notification model (event / recipient / read / priority / timestamp).
 *
 * Channel keys are free-form (max 40 chars). The application must NOT
 * hard-code a specific messaging vendor (no WhatsApp, SMS provider, etc.)
 * into the core model or business rules.
 *
 * Foundation: enqueue pending delivery rows; actual transport wiring is
 * deferred until a messaging/storage research milestone.
 */

/** Default channel stamped on every new notification (core surface). */
export const DEFAULT_CHANNEL = "in_app";

/** Example channel keys (not required — any 1–40 char key is valid). */
export const EXAMPLE_CHANNELS = [
  "in_app",
  "email",
  "sms",
  "push",
  "webhook",
] as const;

export type ChannelDeliveryRow = {
  id: string;
  notification_id: string;
  institution_id: string | null;
  channel: string;
  status: "pending" | "sent" | "failed" | "skipped";
  external_ref: string | null;
  error_message: string | null;
  attempted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * Enqueue independent channel deliveries for a notification.
 * Transport senders later claim `pending` rows — core model stays clean.
 */
export async function enqueueChannelDeliveries(
  notification: Pick<NotificationRow, "id" | "institution_id">,
  channels: string[] = [DEFAULT_CHANNEL]
): Promise<void> {
  const unique = Array.from(
    new Set(channels.map((c) => c.trim()).filter(Boolean))
  ).slice(0, 10);

  for (const channel of unique) {
    if (channel.length > 40) continue;
    await pool.query(
      `INSERT INTO public.notification_channel_deliveries (
          notification_id, institution_id, channel, status
       ) VALUES ($1,$2,$3,'pending')
       ON CONFLICT DO NOTHING`,
      [notification.id, notification.institution_id, channel]
    );
  }
}

export async function listDeliveriesForNotification(
  notificationId: string
): Promise<ChannelDeliveryRow[]> {
  const result = await pool.query<ChannelDeliveryRow>(
    `SELECT * FROM public.notification_channel_deliveries
      WHERE notification_id = $1
      ORDER BY created_at ASC`,
    [notificationId]
  );
  return result.rows;
}

/**
 * Mark a delivery attempt result. Used by future channel workers.
 * Does not invent vendor-specific fields.
 */
export async function markDelivery(
  deliveryId: string,
  status: "sent" | "failed" | "skipped",
  opts: { externalRef?: string | null; errorMessage?: string | null } = {}
): Promise<void> {
  await pool.query(
    `UPDATE public.notification_channel_deliveries
        SET status = $2,
            external_ref = COALESCE($3, external_ref),
            error_message = $4,
            attempted_at = now(),
            updated_at = now()
      WHERE id = $1`,
    [deliveryId, status, opts.externalRef ?? null, opts.errorMessage ?? null]
  );
}
