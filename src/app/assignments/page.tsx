import { getAuthContext } from "@/lib/authz";
import { listVisibleAssignments } from "@/lib/assignments";
import { listQuestionPapers, listQuestionBank } from "@/lib/question-bank";
import { listMsts } from "@/lib/mst";
import { attachOwnSubmissions } from "@/lib/student-academics";
import { AssessmentBrowser } from "@/components/assessment-browser";

/**
 * Assignments / questions / papers / MST page — server filters before render.
 */
export default async function AssignmentsPage() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Academic assessment</p>
            <h1>Sign in for assessments</h1>
            <p className="page-description">
              Assignments, question papers, and MST records are available inside
              your academic scope.
            </p>
          </div>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  const [visibleAssignments, papers, questions, msts] = await Promise.all([
    listVisibleAssignments(ctx, { limit: 50 }),
    listQuestionPapers(ctx, { limit: 50 }),
    listQuestionBank(ctx, { limit: 50 }),
    listMsts(ctx, { limit: 50 }),
  ]);
  const assignments = await attachOwnSubmissions(ctx, visibleAssignments);

  return (
    <div className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Academic assessment</p>
          <h1>Assignments</h1>
          <p className="page-description">
            Course work, submissions, question bank, papers, and MST-1/MST-2
            with review/approval.
          </p>
        </div>
      </div>
      <AssessmentBrowser
        roleName={ctx.roleName}
        userId={ctx.userId}
        initialAssignments={assignments.map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          instructions: a.instructions,
          status: a.status,
          dueAt:
            a.due_at instanceof Date
              ? a.due_at.toISOString()
              : a.due_at
                ? String(a.due_at)
                : null,
          maxPoints: a.max_points,
          allowResubmit: a.allow_resubmit,
          subjectName: a.subject_name,
          subjectCode: a.subject_code,
          sectionName: a.section_name,
          academicYear: a.academic_year_name,
          ownerName: a.owner_name,
          isOwner: a.owner_id === ctx.userId || a.created_by === ctx.userId,
          submissionCount: a.submission_count,
          mySubmission: a.my_submission
            ? {
                id: a.my_submission.id,
                assignment_id: a.my_submission.assignment_id,
                attempt_number: a.my_submission.attempt_number,
                status: a.my_submission.status,
                score: a.my_submission.score,
                max_points_snapshot: a.my_submission.max_points_snapshot,
                feedback: a.my_submission.feedback,
                submitted_at:
                  a.my_submission.submitted_at instanceof Date
                    ? a.my_submission.submitted_at.toISOString()
                    : a.my_submission.submitted_at
                      ? String(a.my_submission.submitted_at)
                      : null,
              }
            : null,
        }))}
        initialPapers={papers.map((p) => ({
          id: p.id,
          title: p.title,
          paperKind: p.paper_kind,
          totalMarks: p.total_marks,
          durationMinutes: p.duration_minutes,
          status: p.status,
          subjectName: p.subject_name,
          subjectCode: p.subject_code,
          sectionName: p.section_name,
          ownerName: p.owner_name,
          isOwner: p.owner_id === ctx.userId || p.created_by === ctx.userId,
          itemCount: p.item_count,
        }))}
        initialQuestions={questions.map((q) => ({
          id: q.id,
          questionType: q.question_type,
          questionText: q.question_text,
          marks: q.marks,
          difficulty: q.difficulty,
          status: q.status,
          subjectName: q.subject_name,
          subjectCode: q.subject_code,
          ownerName: q.owner_name,
          isOwner: q.owner_id === ctx.userId || q.created_by === ctx.userId,
        }))}
        initialMsts={msts.map((m) => ({
          id: m.id,
          mstNumber: m.mst_number,
          title: m.title,
          scheduledOn:
            m.scheduled_on instanceof Date
              ? m.scheduled_on.toISOString().slice(0, 10)
              : m.scheduled_on
                ? String(m.scheduled_on)
                : null,
          maxMarks: m.max_marks,
          status: m.status,
          subjectName: m.subject_name,
          subjectCode: m.subject_code,
          sectionName: m.section_name,
          academicYear: m.academic_year_name,
          ownerName: m.owner_name,
          isOwner: m.owner_id === ctx.userId || m.created_by === ctx.userId,
          questionPaperId: m.question_paper_id,
        }))}
      />
    </div>
  );
}
