import { getAuthContext } from "@/lib/authz";
import { loadInstitutionWorkspace } from "@/lib/institution-config";
import { listConfigChanges } from "@/lib/institution-changes";
import { ConfigChangeList } from "@/components/institution/config-changes";

export default async function InstitutionChangesPage() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return (
      <div className="placeholder-page">
        <h1>Sign in required</h1>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  let data;
  try {
    data = await loadInstitutionWorkspace(ctx);
  } catch {
    return (
      <div className="placeholder-page">
        <p className="eyebrow">Institution workspace</p>
        <h1>Not available for your role</h1>
      </div>
    );
  }

  const changes = await listConfigChanges(ctx, { limit: 50 });

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Config changes</p>
          <h1>Review &amp; publish</h1>
          <p className="welcome-copy">
            Controlled lifecycle for sensitive configuration areas.
          </p>
        </div>
      </section>

      <ConfigChangeList
        canApprove={data.scope.canApprove}
        canConfigure={data.scope.canConfigure}
        changes={changes.map((c) => ({
          id: c.id,
          area: c.area,
          status: c.status,
          requesterName: c.requester_name,
          reviewerName: c.reviewer_name,
          reviewNote: c.review_note,
          createdAt: c.created_at.toISOString(),
          payload: c.payload,
        }))}
      />
    </div>
  );
}
