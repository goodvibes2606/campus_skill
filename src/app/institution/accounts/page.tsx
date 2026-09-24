import { getAuthContext } from "@/lib/authz";
import { listAccounts, ACCOUNT_STATUSES } from "@/lib/account-lifecycle";
import { AccountLifecycleTable } from "@/components/accounts/account-lifecycle-table";

export const metadata = {
  title: "Accounts | Campus Skill",
};

export default async function InstitutionAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
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

  const params = await searchParams;
  let users;
  try {
    users = await listAccounts(ctx, {
      status: params.status,
      limit: 200,
    });
  } catch {
    return (
      <div className="placeholder-page">
        <p className="eyebrow">Institution · Accounts</p>
        <h1>Not available for your role</h1>
        <p className="page-description">
          Account lifecycle is limited to institution admin and Director/Dean.
        </p>
      </div>
    );
  }

  const statusFilters = ["all", ...ACCOUNT_STATUSES];

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Institution · Account lifecycle</p>
          <h1>Accounts</h1>
          <p className="welcome-copy">
            Change status: active, suspended, inactive, graduated, left.
            Historical academic records are never deleted. You cannot suspend
            your own account.
          </p>
        </div>
      </section>

      <div className="help-module-chips" style={{ marginBottom: 16 }}>
        {statusFilters.map((s) => {
          const active =
            (params.status ?? "all") === s ||
            (s === "all" && !params.status);
          const href =
            s === "all" ? "/institution/accounts" : `/institution/accounts?status=${s}`;
          return (
            <a
              key={s}
              className={`ai-chip ${active ? "ai-chip-active" : ""}`}
              href={href}
            >
              {s}
            </a>
          );
        })}
      </div>

      <section className="dash-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">directory</p>
            <h2>{users.length} account{users.length === 1 ? "" : "s"}</h2>
          </div>
        </div>
        <AccountLifecycleTable
          currentUserId={ctx.userId}
          users={users.map((u) => ({
            id: u.id,
            fullName: u.full_name,
            email: u.email,
            status: u.status,
            roleName: u.role_name,
          }))}
          canEdit
        />
      </section>
    </div>
  );
}
