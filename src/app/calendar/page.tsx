import { getAuthContext } from "@/lib/authz";
import { listCalendarEvents } from "@/lib/calendar";
import { CalendarBrowser } from "@/components/calendar-browser";

/**
 * Academic calendar page — server filters before render.
 */
export default async function CalendarPage() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Academic operations</p>
            <h1>Sign in to view calendar</h1>
            <p className="page-description">
              Institutional dates are visible only inside your authorized scope.
            </p>
          </div>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  const events = await listCalendarEvents(ctx, { limit: 50 });

  return (
    <div className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Academic operations</p>
          <h1>Academic calendar</h1>
          <p className="page-description">
            Institutional dates with approval state and circulation foundation.
          </p>
        </div>
      </div>
      <CalendarBrowser
        roleName={ctx.roleName}
        userId={ctx.userId}
        initialEvents={events.map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          eventType: e.event_type,
          startsOn:
            e.starts_on instanceof Date
              ? e.starts_on.toISOString().slice(0, 10)
              : String(e.starts_on),
          endsOn:
            e.ends_on instanceof Date
              ? e.ends_on.toISOString().slice(0, 10)
              : String(e.ends_on),
          status: e.status,
          departmentCode: e.department_code,
          creatorName: e.creator_name,
          isCreator: e.created_by === ctx.userId,
          approvalNote: e.approval_note,
          circulatedAt:
            e.circulated_at instanceof Date
              ? e.circulated_at.toISOString()
              : e.circulated_at
                ? String(e.circulated_at)
                : null,
        }))}
      />
    </div>
  );
}
