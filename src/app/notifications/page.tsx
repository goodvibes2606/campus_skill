import { getAuthContext } from "@/lib/authz";
import { listNotifications, countUnreadNotifications } from "@/lib/notifications";
import { NotificationList } from "@/components/notification-list";

/**
 * Notifications page — recipient-only server filter.
 */
export default async function NotificationsPage() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Academic operations</p>
            <h1>Sign in to view notifications</h1>
            <p className="page-description">
              Notifications are only visible to their recipient.
            </p>
          </div>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  const notifications = await listNotifications(ctx, { limit: 50 });
  const unreadCount = await countUnreadNotifications(ctx);

  return (
    <div className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Academic operations</p>
          <h1>Notifications</h1>
          <p className="page-description">
            Event · recipient · read/unread · priority · timestamp. Channels stay
            independent of this model.
          </p>
        </div>
      </div>
      <NotificationList
        initialNotifications={notifications.map((n) => ({
          id: n.id,
          event: n.event,
          title: n.title,
          body: n.body,
          priority: n.priority,
          isRead: n.is_read,
          createdAt:
            n.created_at instanceof Date
              ? n.created_at.toISOString()
              : String(n.created_at),
        }))}
        initialUnread={unreadCount}
      />
    </div>
  );
}
