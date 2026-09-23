import { getAuthContext } from "@/lib/authz";
import { listDailyWorkReports } from "@/lib/daily-work";
import { DailyWorkBrowser } from "@/components/daily-work-browser";

/**
 * Daily work page — faculty/HOD reporting; server filters before render.
 */
export default async function DailyWorkPage() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Academic operations</p>
            <h1>Sign in for daily work</h1>
            <p className="page-description">
              Daily work reports are available to faculty, HOD, and admin.
            </p>
          </div>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  if (ctx.roleName === "student") {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Academic operations</p>
            <h1>Daily work</h1>
            <p className="page-description">
              Daily work reporting is for faculty and HOD only.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const reports = await listDailyWorkReports(ctx, { limit: 50 });

  return (
    <div className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Academic operations</p>
          <h1>Daily work</h1>
          <p className="page-description">
            Faculty/HOD file daily reports; HOD acknowledges department
            submissions.
          </p>
        </div>
      </div>
      <DailyWorkBrowser
        roleName={ctx.roleName}
        userId={ctx.userId}
        initialReports={reports.map((r) => ({
          id: r.id,
          reportDate:
            r.report_date instanceof Date
              ? r.report_date.toISOString().slice(0, 10)
              : String(r.report_date),
          summary: r.summary,
          status: r.status,
          reporterName: r.reporter_name,
          departmentCode: r.department_code,
          isReporter: r.reporter_id === ctx.userId,
          returnNote: r.return_note,
          items: r.items.map((item) => ({
            id: item.id,
            workType: item.work_type,
            description: item.description,
            durationMinutes: item.duration_minutes,
          })),
        }))}
      />
    </div>
  );
}
