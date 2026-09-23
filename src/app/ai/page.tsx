import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import {
  AI_FEATURES,
  canUseAi,
  suggestedFeatures,
  type AiFeatureMeta,
} from "@/lib/ai-features";
import { listEnrolledSubjects } from "@/lib/student-academics";
import { listVisibleResources } from "@/lib/resources";
import { listVisibleAssignments } from "@/lib/assignments";
import { listVisibleSyllabi } from "@/lib/syllabus";
import { listOpportunities } from "@/lib/placement-opportunities";
import { AiWorkspace } from "@/components/ai/ai-workspace";
import type { AiContextKind, AiFeature } from "@/lib/ai/types";

/**
 * AI Assistance workspace (Milestone 10).
 * Server loads role features + authorized context options; the client
 * component only renders. Every assist call re-authorizes on the server.
 */

type ContextOption = {
  kind: AiContextKind | "general";
  id: string;
  label: string;
};

async function loadContextOptions(
  ctx: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>
): Promise<ContextOption[]> {
  const roleName = ctx.roleName;
  const options: ContextOption[] = [];

  // system_admin is technical-only — no academic/placement context options.
  const wantsAcademic =
    roleName === "student" || roleName === "faculty" || roleName === "hod";

  if (wantsAcademic) {
    if (roleName === "student") {
      const { subjects } = await listEnrolledSubjects(ctx);
      for (const s of subjects) {
        options.push({
          kind: "subject",
          id: s.id,
          label: `${s.subject_code} · ${s.name}`,
        });
      }
    }

    try {
      const [resources, assignments, syllabi] = await Promise.all([
        listVisibleResources(ctx, { limit: 25, status: "published" }),
        listVisibleAssignments(ctx, { limit: 25 }),
        listVisibleSyllabi(ctx, { limit: 25, status: "published" }),
      ]);
      for (const r of resources) {
        options.push({ kind: "resource", id: r.id, label: r.title });
      }
      for (const a of assignments) {
        options.push({ kind: "assignment", id: a.id, label: a.title });
      }
      for (const s of syllabi) {
        options.push({ kind: "syllabus", id: s.id, label: s.title });
      }
    } catch {
      // Visibility-filtered loaders may throw for odd roles — options stay empty.
    }
  }

  if (roleName === "tpo" || roleName === "director_dean") {
    try {
      const opps = await listOpportunities(ctx, { limit: 25 });
      for (const o of opps) {
        options.push({
          kind: "opportunity",
          id: o.id,
          label: `${o.title} · ${o.company_name}`,
        });
      }
    } catch {
      // placement denied for this context — leave empty
    }
  }

  return options;
}

function renderSignedOut() {
  return (
    <div className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AI assistance</p>
          <h1>Sign in for Campus Skill Assist</h1>
          <p className="page-description">
            AI assistance works inside your authorized academic and placement
            scope — server-side checks apply to every request.
          </p>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    </div>
  );
}

function renderDenied(roleName: string) {
  return (
    <div className="placeholder-page" role="alert">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AI assistance</p>
          <h1>Not available for your role</h1>
          <p className="page-description">
            Role “{roleName}” does not have AI assistance enabled. System
            administration and external roles do not receive academic or
            institutional AI access by default.
          </p>
        </div>
        <div className="placeholder-seal" aria-hidden="true">
          !
        </div>
      </div>
      <section className="coming-soon-panel">
        <div className="panel-line" />
        <p className="panel-label">Authorization</p>
        <h2>Server-side role check</h2>
        <p>
          The AI workspace enforces the same role and institution rules as the
          rest of Campus Skill.
        </p>
        <div className="auth-actions-row">
          <Link className="text-link" href="/">
            Dashboard <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default async function AiAssistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await getAuthContext();
  if (!ctx) return renderSignedOut();
  if (!canUseAi(ctx.roleName)) return renderDenied(ctx.roleName);

  const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

  const featureParam = first(params.feature);
  const kindParam = first(params.contextType);
  const idParam = first(params.contextId);

  const features: AiFeatureMeta[] = suggestedFeatures(ctx.roleName).map(
    (f) => AI_FEATURES[f.id]
  );
  const contextOptions = await loadContextOptions(ctx);

  // If deep-linked context id isn't in options, inject a synthetic label
  // (server will still re-authorize on assist).
  if (kindParam && idParam) {
    const known = contextOptions.some(
      (o) => o.kind === kindParam && o.id === idParam
    );
    if (!known && kindParam !== "general") {
      contextOptions.unshift({
        kind: kindParam as AiContextKind,
        id: idParam,
        label: `Linked ${kindParam}`,
      });
    }
  }

  const initialFeature =
    featureParam && features.some((f) => f.id === featureParam)
      ? (featureParam as AiFeature)
      : null;
  const initialLabel =
    contextOptions.find((o) => o.id === idParam)?.label ?? null;

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">AI assistance · {ctx.roleName}</p>
          <h1>Campus Skill Assist</h1>
          <p className="welcome-copy">
            Institutional assistance layer — explanations, drafts, summaries,
            and revision support inside your authorized scope. Never automatic
            grades, approvals, or decisions.
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span>✦</span>
        </div>
      </section>

      <AiWorkspace
        roleName={ctx.roleName}
        features={features}
        contextOptions={contextOptions}
        initialFeature={initialFeature}
        initialContextKind={kindParam ?? null}
        initialContextId={idParam ?? null}
        initialContextLabel={initialLabel}
      />
    </div>
  );
}
