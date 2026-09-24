import { getAuthContext } from "@/lib/authz";
import {
  filterHelpArticles,
  getHelpArticle,
  helpModulesForRole,
  HELP_MODULES,
} from "@/lib/help-kb";

export const metadata = {
  title: "Help | Campus Skill",
};

/**
 * Campus Skill Help — role + module aware static knowledge base.
 * No AI key required; structured for future AI retrieval.
 */
export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; module?: string; q?: string }>;
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

  if (params.id) {
    const article = getHelpArticle(params.id, ctx.roleName);
    if (!article) {
      return (
        <div className="placeholder-page">
          <p className="eyebrow">Help</p>
          <h1>Article not available</h1>
          <p className="page-description">
            That help article does not exist or is not written for your role.
          </p>
          <p className="auth-switch">
            <a className="text-link" href="/help">
              Back to Help
            </a>
          </p>
        </div>
      );
    }
    const related = (article.relatedIds ?? [])
      .map((rid) => getHelpArticle(rid, ctx.roleName))
      .filter(Boolean);

    return (
      <div className="dashboard-page help-page">
        <section className="welcome-section">
          <div>
            <p className="eyebrow">Help · {article.module}</p>
            <h1>{article.title}</h1>
            <p className="welcome-copy">{article.summary}</p>
          </div>
        </section>
        <section className="dash-panel help-article-panel">
          <div className="help-tag-row">
            {article.tags.map((t) => (
              <span className="help-tag" key={t}>
                {t}
              </span>
            ))}
          </div>
          <div className="help-body">{article.body}</div>
          {related.length > 0 && (
            <div className="help-related">
              <p className="eyebrow">Related</p>
              <ul>
                {related.map(
                  (r) =>
                    r && (
                      <li key={r.id}>
                        <a className="text-link" href={`/help?id=${r.id}`}>
                          {r.title}
                        </a>
                      </li>
                    )
                )}
              </ul>
            </div>
          )}
          <p className="auth-switch">
            <a className="text-link" href="/help">
              ← All help articles
            </a>
          </p>
        </section>
      </div>
    );
  }

  const modules = helpModulesForRole(ctx.roleName);
  const activeModule = params.module && modules.includes(params.module as never)
    ? params.module
    : "";
  const articles = filterHelpArticles({
    roleName: ctx.roleName,
    module: activeModule || null,
    q: params.q ?? null,
  });

  const moduleLabels: Record<string, string> = {
    "getting-started": "Getting started",
    dashboard: "Dashboard",
    academics: "Academics",
    placement: "Placement",
    institution: "Institution",
    ai: "AI Assist",
    account: "Account",
    privacy: "Privacy & consent",
    "import-export": "Import & export",
    announcements: "Announcements",
    help: "Using Help",
  };

  return (
    <div className="dashboard-page help-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Campus Skill Help</p>
          <h1>How can we help?</h1>
          <p className="welcome-copy">
            Guidance written for your role ({ctx.roleName}) — only shipped
            features are described. Search or browse by module.
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          ?
        </div>
      </section>

      <section className="dash-panel help-search-panel">
        <form className="help-search-form" action="/help" method="get">
          <label className="placement-field" htmlFor="q">
            <span>Search help</span>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={params.q ?? ""}
              placeholder="password, import, syllabus…"
            />
          </label>
          <button className="auth-submit" type="submit">
            Search
          </button>
        </form>
        <div className="help-module-chips" aria-label="Filter by module">
          <a
            className={`ai-chip ${!activeModule ? "ai-chip-active" : ""}`}
            href="/help"
          >
            All
          </a>
          {HELP_MODULES.filter((m) => modules.includes(m)).map((m) => (
            <a
              key={m}
              className={`ai-chip ${activeModule === m ? "ai-chip-active" : ""}`}
              href={`/help?module=${m}`}
            >
              {moduleLabels[m] ?? m}
            </a>
          ))}
        </div>
      </section>

      <section className="help-grid">
        {articles.length === 0 ? (
          <p className="empty-state">
            No help articles match your search for this role. Try another term
            or clear the filter.
          </p>
        ) : (
          articles.map((a) => (
            <a className="inst-card help-card" key={a.id} href={`/help?id=${a.id}`}>
              <p className="eyebrow">{a.module}</p>
              <h3>{a.title}</h3>
              <p>{a.summary}</p>
              <span className="text-link">Read article →</span>
            </a>
          ))
        )}
      </section>

      <section className="dash-panel help-footnote">
        <p className="eyebrow">About this help center</p>
        <p className="placement-muted">
          Articles are static and reviewed against shipped product scope — they
          never invent capabilities. Structured with stable IDs for future AI
          retrieval; AI is not required to use Help.
        </p>
      </section>
    </div>
  );
}
