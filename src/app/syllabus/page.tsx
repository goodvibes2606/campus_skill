import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import { listVisibleSyllabi } from "@/lib/syllabus";
import { SyllabusBrowser } from "@/components/syllabus-browser";
import { canUseAi } from "@/lib/ai-features";

/**
 * Syllabus page — server filters before render.
 */
export default async function SyllabusPage() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Academic operations</p>
            <h1>Sign in to view syllabi</h1>
            <p className="page-description">
              Syllabi are visible only inside your authorized academic scope.
            </p>
          </div>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  const syllabi = await listVisibleSyllabi(ctx, { limit: 50 });

  return (
    <div className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Academic operations</p>
          <h1>Syllabus</h1>
          <p className="page-description">
            Subject · subject code · academic year · version · units · topics ·
            status · source.
          </p>
        </div>
      </div>
      {canUseAi(ctx.roleName) ? (
        <div className="ai-entry">
          <p>Generate revision questions or a study outline from an authorized syllabus.</p>
          <Link className="text-link" href="/ai?feature=revision_questions&contextType=syllabus">
            Open AI Assist <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : null}
      <SyllabusBrowser
        roleName={ctx.roleName}
        initialSyllabi={syllabi.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          version: s.version,
          status: s.status,
          sourceType: s.source_type,
          sourceReference: s.source_reference,
          sourceIsOfficial: s.source_is_official,
          subjectName: s.subject_name,
          subjectCode: s.subject_code,
          academicYear: s.academic_year_name,
          unitCount: s.unit_count,
          creatorName: s.creator_name,
          isOwner: s.created_by === ctx.userId,
        }))}
      />
    </div>
  );
}
