import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import { listVisibleResources } from "@/lib/resources";
import { ResourceBrowser } from "@/components/resource-browser";
import { canUseAi } from "@/lib/ai-features";

/**
 * Notes / Academic resources page.
 * Server component: visibility filter runs on the server before any HTML
 * leaves the process — students only receive their enrolled context.
 */
export default async function NotesPage() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Academic resources</p>
            <h1>Sign in to view notes</h1>
            <p className="page-description">
              Resources are only visible inside your authorized academic
              context.
            </p>
          </div>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  const resources = await listVisibleResources(ctx, { limit: 50 });

  return (
    <div className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Academic resources</p>
          <h1>Notes &amp; study materials</h1>
          <p className="page-description">
            Server-side visibility: you only see resources inside your
            authorized academic scope.
          </p>
        </div>
      </div>
      {canUseAi(ctx.roleName) ? (
        <div className="ai-entry">
          <p>Summarize authorized notes or generate revision questions with AI assistance.</p>
          <Link className="text-link" href="/ai?feature=summarize_content&contextType=resource">
            Open AI Assist <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : null}
      <ResourceBrowser
        roleName={ctx.roleName}
        userId={ctx.userId}
        initialResources={resources.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          resourceType: r.resource_type,
          status: r.status,
          version: r.version,
          subjectName: r.subject_name,
          subjectCode: r.subject_code,
          sectionName: r.section_name,
          academicYear: r.academic_year_name,
          semesterNumber: r.semester_number,
          ownerName: r.owner_name,
          isOwner: r.owner_id === ctx.userId,
          syllabusRef: r.syllabus_ref,
          unitRef: r.unit_ref,
          topicRef: r.topic_ref,
          originalFilename: r.original_filename,
          mimeType: r.mime_type,
          sizeBytes: r.size_bytes,
          updatedAt:
            r.updated_at instanceof Date
              ? r.updated_at.toISOString()
              : String(r.updated_at),
        }))}
      />
    </div>
  );
}
