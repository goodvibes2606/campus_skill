"use client";

import { useCallback, useEffect, useState } from "react";

type OwnSubmission = {
  id: string;
  assignment_id: string;
  attempt_number: number;
  status: string;
  score: number | null;
  max_points_snapshot: number | null;
  feedback: string;
  submitted_at: string | null;
};

type AssignmentRow = {
  id: string;
  title: string;
  description: string;
  instructions: string;
  status: string;
  dueAt: string | null;
  maxPoints: number | null;
  allowResubmit: boolean;
  subjectName: string;
  subjectCode: string;
  sectionName: string;
  academicYear: string;
  ownerName: string;
  isOwner: boolean;
  submissionCount: number;
  mySubmission?: OwnSubmission | null;
};

type PaperRow = {
  id: string;
  title: string;
  paperKind: string;
  totalMarks: number;
  durationMinutes: number | null;
  status: string;
  subjectName: string;
  subjectCode: string;
  sectionName: string | null;
  ownerName: string;
  isOwner: boolean;
  itemCount: number;
};

type QuestionRow = {
  id: string;
  questionType: string;
  questionText: string;
  marks: number;
  difficulty: string;
  status: string;
  subjectName: string;
  subjectCode: string;
  ownerName: string;
  isOwner: boolean;
};

type MstRow = {
  id: string;
  mstNumber: number;
  title: string;
  scheduledOn: string | null;
  maxMarks: number;
  status: string;
  subjectName: string;
  subjectCode: string;
  sectionName: string;
  academicYear: string;
  ownerName: string;
  isOwner: boolean;
  questionPaperId: string | null;
};

type SubmissionRow = {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  studentId: string;
  studentName: string;
  attemptNumber: number;
  status: string;
  contentText: string;
  score: number | null;
  feedback: string;
  isStudent: boolean;
};

type SelectOption = { id: string; label: string };
type Tab = "assignments" | "questions" | "papers" | "mst";

const ASSIGNMENT_ACTIONS: Array<{ from: string; to: string; label: string }> = [
  { from: "draft", to: "published", label: "Publish" },
  { from: "published", to: "closed", label: "Close" },
  { from: "closed", to: "archived", label: "Archive" },
  { from: "archived", to: "draft", label: "Reopen" },
];

const PAPER_ACTIONS: Array<{ from: string; to: string; label: string }> = [
  { from: "draft", to: "in_review", label: "Submit review" },
  { from: "in_review", to: "approved", label: "Approve" },
  { from: "in_review", to: "draft", label: "Reject" },
  { from: "approved", to: "published", label: "Publish" },
  { from: "published", to: "archived", label: "Archive" },
  { from: "archived", to: "draft", label: "Reopen" },
];

const QUESTION_ACTIONS: Array<{ from: string; to: string; label: string }> = [
  { from: "draft", to: "approved", label: "Approve" },
  { from: "approved", to: "draft", label: "Unapprove" },
  { from: "approved", to: "retired", label: "Retire" },
  { from: "retired", to: "draft", label: "Restore" },
];

const MST_ACTIONS: Array<{ from: string; to: string; label: string }> = [
  { from: "draft", to: "in_review", label: "Submit review" },
  { from: "in_review", to: "approved", label: "Approve" },
  { from: "in_review", to: "draft", label: "Reject" },
  { from: "approved", to: "published", label: "Publish" },
  { from: "published", to: "archived", label: "Archive" },
  { from: "archived", to: "draft", label: "Reopen" },
];

export function AssessmentBrowser({
  roleName,
  userId,
  initialAssignments,
  initialPapers,
  initialQuestions,
  initialMsts,
}: {
  roleName: string;
  userId: string;
  initialAssignments: AssignmentRow[];
  initialPapers: PaperRow[];
  initialQuestions: QuestionRow[];
  initialMsts: MstRow[];
}) {
  const [tab, setTab] = useState<Tab>("assignments");
  const [assignments, setAssignments] = useState(initialAssignments);
  const [papers, setPapers] = useState(initialPapers);
  const [questions, setQuestions] = useState(initialQuestions);
  const [msts, setMsts] = useState(initialMsts);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [submissionFor, setSubmissionFor] = useState<AssignmentRow | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [contentText, setContentText] = useState("");
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({});
  const [feedbackDraft, setFeedbackDraft] = useState<Record<string, string>>({});

  const canCreate =
    roleName === "faculty" ||
    roleName === "hod" ||
    roleName === "admin" ||
    roleName === "system_admin";
  const isStudent = roleName === "student";

  const [assignForm, setAssignForm] = useState({
    sectionId: "",
    subjectId: "",
    title: "",
    description: "",
    dueAt: "",
    maxPoints: "10",
  });
  const [questionForm, setQuestionForm] = useState({
    subjectId: "",
    questionText: "",
    marks: "2",
    questionType: "short",
  });
  const [paperForm, setPaperForm] = useState({
    sectionId: "",
    subjectId: "",
    title: "",
    paperKind: "assignment",
    durationMinutes: "60",
  });
  const [mstForm, setMstForm] = useState({
    sectionId: "",
    subjectId: "",
    mstNumber: "1",
    title: "",
    scheduledOn: "",
    maxMarks: "40",
    createPaper: false,
  });

  const [sectionOptions, setSectionOptions] = useState<SelectOption[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<SelectOption[]>([]);
  const [scopeNote, setScopeNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [a, p, q, m] = await Promise.all([
      fetch("/api/assignments?limit=50", { cache: "no-store" }),
      fetch("/api/question-papers?limit=50", { cache: "no-store" }),
      fetch("/api/question-bank?limit=50", { cache: "no-store" }),
      fetch("/api/msts?limit=50", { cache: "no-store" }),
    ]);
    if (a.ok) {
      const d = await a.json();
      setAssignments(d.assignments ?? []);
    } else {
      setError(`Failed to load assignments (${a.status})`);
    }
    if (p.ok) {
      const d = await p.json();
      setPapers(d.papers ?? []);
    }
    if (q.ok) {
      const d = await q.json();
      setQuestions(d.questions ?? []);
    }
    if (m.ok) {
      const d = await m.json();
      setMsts(d.msts ?? []);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await refresh();
      if (!canCreate) return;
      try {
        const res = await fetch("/api/academic/context", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const assignmentsList = (data.facultyAssignments ??
          []) as Array<Record<string, unknown>>;
        const secMap = new Map<string, string>();
        const subMap = new Map<string, string>();
        for (const a of assignmentsList) {
          const sid = String(a.section_id ?? a.sectionId ?? "");
          const sname = String(a.section_name ?? a.sectionName ?? sid);
          const subid = String(a.subject_id ?? a.subjectId ?? "");
          const subname = String(a.subject_name ?? a.subjectName ?? subid);
          const subcode = String(a.subject_code ?? a.subjectCode ?? "");
          if (sid && !secMap.has(sid)) secMap.set(sid, sname || sid);
          if (subid && !subMap.has(subid)) {
            subMap.set(subid, subcode ? `${subname} (${subcode})` : subname);
          }
        }
        // student enrollment fallback for display only
        if (data.enrollment) {
          const e = data.enrollment as Record<string, unknown>;
          if (e.section_id) {
            secMap.set(String(e.section_id), "My section");
          }
        }
        setSectionOptions([...secMap].map(([id, label]) => ({ id, label })));
        setSubjectOptions([...subMap].map(([id, label]) => ({ id, label })));
        if (secMap.size === 0 && roleName === "faculty") {
          setScopeNote(
            "No teaching assignments loaded — enter section/subject IDs."
          );
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canCreate, refresh, roleName]);

  async function patchJson(path: string, body: unknown): Promise<boolean> {
    const res = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Update failed (${res.status})`);
      return false;
    }
    setError(null);
    return true;
  }

  async function postJson(path: string, body: unknown): Promise<boolean> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Create failed (${res.status})`);
      return false;
    }
    setError(null);
    return true;
  }

  async function onStatusChange(
    kind: Tab,
    id: string,
    status: string
  ) {
    setBusy(true);
    try {
      const path =
        kind === "assignments"
          ? `/api/assignments/${id}`
          : kind === "papers"
            ? `/api/question-papers/${id}`
            : kind === "mst"
              ? `/api/msts/${id}`
              : `/api/question-bank/${id}`;
      if (await patchJson(path, { status })) {
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCreateAssignment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ok = await postJson("/api/assignments", {
        sectionId: assignForm.sectionId,
        subjectId: assignForm.subjectId,
        title: assignForm.title,
        description: assignForm.description,
        dueAt: assignForm.dueAt || null,
        maxPoints: Number(assignForm.maxPoints) || null,
        status: "draft",
      });
      if (ok) {
        setAssignForm((f) => ({ ...f, title: "", description: "" }));
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCreateQuestion(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ok = await postJson("/api/question-bank", {
        subjectId: questionForm.subjectId,
        questionText: questionForm.questionText,
        marks: Number(questionForm.marks) || 1,
        questionType: questionForm.questionType,
        status: "draft",
      });
      if (ok) {
        setQuestionForm((f) => ({ ...f, questionText: "" }));
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCreatePaper(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ok = await postJson("/api/question-papers", {
        sectionId: paperForm.sectionId || null,
        subjectId: paperForm.subjectId,
        title: paperForm.title,
        paperKind: paperForm.paperKind,
        durationMinutes: Number(paperForm.durationMinutes) || null,
        status: "draft",
      });
      if (ok) {
        setPaperForm((f) => ({ ...f, title: "" }));
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCreateMst(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ok = await postJson("/api/msts", {
        sectionId: mstForm.sectionId,
        subjectId: mstForm.subjectId,
        mstNumber: Number(mstForm.mstNumber),
        title: mstForm.title,
        scheduledOn: mstForm.scheduledOn || null,
        maxMarks: Number(mstForm.maxMarks) || 40,
        createPaper: mstForm.createPaper,
        status: "draft",
      });
      if (ok) {
        setMstForm((f) => ({ ...f, title: "" }));
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function openSubmissions(a: AssignmentRow) {
    setSubmissionFor(a);
    setContentText("");
    setBusy(true);
    try {
      const res = await fetch(`/api/assignments/${a.id}/submissions`, {
        cache: "no-store",
      });
      if (res.ok) {
        const d = await res.json();
        setSubmissions(d.submissions ?? []);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.message || `Load submissions failed (${res.status})`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitWork(e: React.FormEvent) {
    e.preventDefault();
    if (!submissionFor) return;
    setBusy(true);
    try {
      const ok = await postJson(
        `/api/assignments/${submissionFor.id}/submissions`,
        { contentText, submit: true }
      );
      if (ok) {
        setContentText("");
        await openSubmissions(submissionFor);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onReview(sub: SubmissionRow, action: "grade" | "return") {
    setBusy(true);
    try {
      const body =
        action === "grade"
          ? {
              action: "grade",
              score: Number(scoreDraft[sub.id] ?? 0),
              feedback: feedbackDraft[sub.id] ?? "",
            }
          : {
              action: "return",
              feedback: feedbackDraft[sub.id] ?? "",
            };
      if (
        await patchJson(
          `/api/assignments/${sub.assignmentId}/submissions/${sub.id}`,
          body
        )
      ) {
        if (submissionFor) await openSubmissions(submissionFor);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "assignments", label: "Assignments" },
    { id: "questions", label: "Questions" },
    { id: "papers", label: "Papers" },
    { id: "mst", label: "MST" },
  ];

  return (
    <div>
      {error && <p className="auth-error">{error}</p>}
      {scopeNote && <p className="muted-copy">{scopeNote}</p>}

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
        role="tablist"
        aria-label="Assessment sections"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={
              tab === t.id ? "quiet-button nav-item-active" : "quiet-button"
            }
            onClick={() => setTab(t.id)}
            aria-selected={tab === t.id}
            role="tab"
          >
            {t.label}
          </button>
        ))}
      </div>

      {canCreate && tab === "assignments" && (
        <form
          className="coming-soon-panel"
          style={{ marginBottom: 24 }}
          onSubmit={onCreateAssignment}
        >
          <p className="panel-label">Create assignment</p>
          <div className="auth-form">
            <div className="auth-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="auth-field">
                <span>Section ID</span>
                {sectionOptions.length > 0 ? (
                  <select
                    required
                    value={assignForm.sectionId}
                    onChange={(e) =>
                      setAssignForm((f) => ({
                        ...f,
                        sectionId: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select section</option>
                    {sectionOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required
                    value={assignForm.sectionId}
                    onChange={(e) =>
                      setAssignForm((f) => ({
                        ...f,
                        sectionId: e.target.value,
                      }))
                    }
                    placeholder="section uuid"
                  />
                )}
              </label>
              <label className="auth-field">
                <span>Subject ID</span>
                {subjectOptions.length > 0 ? (
                  <select
                    required
                    value={assignForm.subjectId}
                    onChange={(e) =>
                      setAssignForm((f) => ({
                        ...f,
                        subjectId: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select subject</option>
                    {subjectOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required
                    value={assignForm.subjectId}
                    onChange={(e) =>
                      setAssignForm((f) => ({
                        ...f,
                        subjectId: e.target.value,
                      }))
                    }
                    placeholder="subject uuid"
                  />
                )}
              </label>
            </div>
            <label className="auth-field">
              <span>Title</span>
              <input
                required
                value={assignForm.title}
                onChange={(e) =>
                  setAssignForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </label>
            <label className="auth-field">
              <span>Description</span>
              <textarea
                value={assignForm.description}
                onChange={(e) =>
                  setAssignForm((f) => ({
                    ...f,
                    description: e.target.value,
                  }))
                }
                rows={2}
              />
            </label>
            <div className="auth-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="auth-field">
                <span>Due at</span>
                <input
                  type="datetime-local"
                  value={assignForm.dueAt}
                  onChange={(e) =>
                    setAssignForm((f) => ({ ...f, dueAt: e.target.value }))
                  }
                />
              </label>
              <label className="auth-field">
                <span>Max points</span>
                <input
                  type="number"
                  min={1}
                  value={assignForm.maxPoints}
                  onChange={(e) =>
                    setAssignForm((f) => ({
                      ...f,
                      maxPoints: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Create draft"}
            </button>
          </div>
        </form>
      )}

      {canCreate && tab === "questions" && (
        <form
          className="coming-soon-panel"
          style={{ marginBottom: 24 }}
          onSubmit={onCreateQuestion}
        >
          <p className="panel-label">Add question</p>
          <div className="auth-form">
            <label className="auth-field">
              <span>Subject</span>
              {subjectOptions.length > 0 ? (
                <select
                  required
                  value={questionForm.subjectId}
                  onChange={(e) =>
                    setQuestionForm((f) => ({
                      ...f,
                      subjectId: e.target.value,
                    }))
                  }
                >
                  <option value="">Select subject</option>
                  {subjectOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required
                  value={questionForm.subjectId}
                  onChange={(e) =>
                    setQuestionForm((f) => ({
                      ...f,
                      subjectId: e.target.value,
                    }))
                  }
                  placeholder="subject uuid"
                />
              )}
            </label>
            <div className="auth-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="auth-field">
                <span>Type</span>
                <select
                  value={questionForm.questionType}
                  onChange={(e) =>
                    setQuestionForm((f) => ({
                      ...f,
                      questionType: e.target.value,
                    }))
                  }
                >
                  <option value="short">Short</option>
                  <option value="long">Long</option>
                  <option value="mcq">MCQ</option>
                  <option value="numerical">Numerical</option>
                  <option value="true_false">True/False</option>
                </select>
              </label>
              <label className="auth-field">
                <span>Marks</span>
                <input
                  type="number"
                  min={1}
                  value={questionForm.marks}
                  onChange={(e) =>
                    setQuestionForm((f) => ({ ...f, marks: e.target.value }))
                  }
                />
              </label>
            </div>
            <label className="auth-field">
              <span>Question</span>
              <textarea
                required
                rows={3}
                value={questionForm.questionText}
                onChange={(e) =>
                  setQuestionForm((f) => ({
                    ...f,
                    questionText: e.target.value,
                  }))
                }
              />
            </label>
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Add draft question"}
            </button>
          </div>
        </form>
      )}

      {canCreate && tab === "papers" && (
        <form
          className="coming-soon-panel"
          style={{ marginBottom: 24 }}
          onSubmit={onCreatePaper}
        >
          <p className="panel-label">Create question paper</p>
          <div className="auth-form">
            <div className="auth-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="auth-field">
                <span>Section (optional)</span>
                {sectionOptions.length > 0 ? (
                  <select
                    value={paperForm.sectionId}
                    onChange={(e) =>
                      setPaperForm((f) => ({
                        ...f,
                        sectionId: e.target.value,
                      }))
                    }
                  >
                    <option value="">Subject-level</option>
                    {sectionOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={paperForm.sectionId}
                    onChange={(e) =>
                      setPaperForm((f) => ({
                        ...f,
                        sectionId: e.target.value,
                      }))
                    }
                    placeholder="section uuid or empty"
                  />
                )}
              </label>
              <label className="auth-field">
                <span>Subject</span>
                {subjectOptions.length > 0 ? (
                  <select
                    required
                    value={paperForm.subjectId}
                    onChange={(e) =>
                      setPaperForm((f) => ({
                        ...f,
                        subjectId: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select subject</option>
                    {subjectOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required
                    value={paperForm.subjectId}
                    onChange={(e) =>
                      setPaperForm((f) => ({
                        ...f,
                        subjectId: e.target.value,
                      }))
                    }
                    placeholder="subject uuid"
                  />
                )}
              </label>
            </div>
            <label className="auth-field">
              <span>Title</span>
              <input
                required
                value={paperForm.title}
                onChange={(e) =>
                  setPaperForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </label>
            <div className="auth-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="auth-field">
                <span>Kind</span>
                <select
                  value={paperForm.paperKind}
                  onChange={(e) =>
                    setPaperForm((f) => ({
                      ...f,
                      paperKind: e.target.value,
                    }))
                  }
                >
                  <option value="assignment">Assignment</option>
                  <option value="quiz">Quiz</option>
                  <option value="mst">MST</option>
                  <option value="final">Final</option>
                  <option value="practice">Practice</option>
                </select>
              </label>
              <label className="auth-field">
                <span>Duration (min)</span>
                <input
                  type="number"
                  min={1}
                  value={paperForm.durationMinutes}
                  onChange={(e) =>
                    setPaperForm((f) => ({
                      ...f,
                      durationMinutes: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Create draft paper"}
            </button>
          </div>
        </form>
      )}

      {canCreate && tab === "mst" && (
        <form
          className="coming-soon-panel"
          style={{ marginBottom: 24 }}
          onSubmit={onCreateMst}
        >
          <p className="panel-label">Create MST</p>
          <div className="auth-form">
            <div className="auth-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="auth-field">
                <span>Section</span>
                {sectionOptions.length > 0 ? (
                  <select
                    required
                    value={mstForm.sectionId}
                    onChange={(e) =>
                      setMstForm((f) => ({
                        ...f,
                        sectionId: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select section</option>
                    {sectionOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required
                    value={mstForm.sectionId}
                    onChange={(e) =>
                      setMstForm((f) => ({
                        ...f,
                        sectionId: e.target.value,
                      }))
                    }
                    placeholder="section uuid"
                  />
                )}
              </label>
              <label className="auth-field">
                <span>Subject</span>
                {subjectOptions.length > 0 ? (
                  <select
                    required
                    value={mstForm.subjectId}
                    onChange={(e) =>
                      setMstForm((f) => ({
                        ...f,
                        subjectId: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select subject</option>
                    {subjectOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required
                    value={mstForm.subjectId}
                    onChange={(e) =>
                      setMstForm((f) => ({
                        ...f,
                        subjectId: e.target.value,
                      }))
                    }
                    placeholder="subject uuid"
                  />
                )}
              </label>
            </div>
            <div className="auth-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="auth-field">
                <span>MST number</span>
                <select
                  value={mstForm.mstNumber}
                  onChange={(e) =>
                    setMstForm((f) => ({ ...f, mstNumber: e.target.value }))
                  }
                >
                  <option value="1">MST-1</option>
                  <option value="2">MST-2</option>
                </select>
              </label>
              <label className="auth-field">
                <span>Scheduled on</span>
                <input
                  type="date"
                  value={mstForm.scheduledOn}
                  onChange={(e) =>
                    setMstForm((f) => ({
                      ...f,
                      scheduledOn: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label className="auth-field">
              <span>Title</span>
              <input
                required
                value={mstForm.title}
                onChange={(e) =>
                  setMstForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </label>
            <div className="auth-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="auth-field">
                <span>Max marks</span>
                <input
                  type="number"
                  min={1}
                  value={mstForm.maxMarks}
                  onChange={(e) =>
                    setMstForm((f) => ({ ...f, maxMarks: e.target.value }))
                  }
                />
              </label>
              <label className="auth-field">
                <span>Linked paper</span>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={mstForm.createPaper}
                    onChange={(e) =>
                      setMstForm((f) => ({
                        ...f,
                        createPaper: e.target.checked,
                      }))
                    }
                  />
                  Create paper draft
                </label>
              </label>
            </div>
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Create MST draft"}
            </button>
          </div>
        </form>
      )}

      {tab === "assignments" && (
        <div className="activity-panel">
          <p className="card-label">Assignments ({assignments.length})</p>
          {assignments.length === 0 ? (
            <p className="muted-copy" style={{ padding: "16px 0" }}>
              No assignments yet.
            </p>
          ) : (
            <div className="activity-list">
              {assignments.map((a) => (
                <div className="activity-item" key={a.id}>
                  <span className="activity-marker marker-green" />
                  <div>
                    <strong>
                      {a.title} <span className="status-pill">{a.status}</span>
                    </strong>
                    <small>
                      {a.subjectName} · {a.sectionName} · {a.academicYear}
                    </small>
                    <small>
                      {a.ownerName}
                      {a.dueAt ? ` · due ${a.dueAt.slice(0, 16).replace("T", " ")}` : ""}
                      {a.maxPoints !== null ? ` · ${a.maxPoints} pts` : ""}
                      {!isStudent && ` · ${a.submissionCount} submission(s)`}
                      {isStudent
                        ? a.mySubmission
                          ? ` · my work: ${a.mySubmission.status}${
                              a.mySubmission.score !== null
                                ? ` · ${a.mySubmission.score}${
                                    a.mySubmission.max_points_snapshot !== null
                                      ? `/${a.mySubmission.max_points_snapshot}`
                                      : ""
                                  }`
                                : ""
                            }`
                          : " · no submission yet"
                        : ""}
                    </small>
                    {isStudent && a.mySubmission?.feedback ? (
                      <small>Feedback: {a.mySubmission.feedback}</small>
                    ) : null}
                    {a.description && <small>{a.description}</small>}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="quiet-button"
                        disabled={busy}
                        onClick={() => openSubmissions(a)}
                      >
                        {isStudent ? "My work" : "Submissions"}
                      </button>
                      {a.isOwner &&
                        ASSIGNMENT_ACTIONS.filter(
                          (act) => act.from === a.status
                        ).map((act) => (
                          <button
                            key={act.to}
                            type="button"
                            className="quiet-button"
                            disabled={busy}
                            onClick={() => onStatusChange("assignments", a.id, act.to)}
                          >
                            {act.label}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "questions" && (
        <div className="activity-panel">
          <p className="card-label">Question bank ({questions.length})</p>
          {questions.length === 0 ? (
            <p className="muted-copy" style={{ padding: "16px 0" }}>
              {isStudent
                ? "Question bank is not shown to students."
                : "No questions yet."}
            </p>
          ) : (
            <div className="activity-list">
              {questions.map((q) => (
                <div className="activity-item" key={q.id}>
                  <span className="activity-marker marker-green" />
                  <div>
                    <strong>
                      {q.questionType}{" "}
                      <span className="status-pill">{q.status}</span>
                    </strong>
                    <small>
                      {q.subjectName} · {q.marks} mark(s) · {q.difficulty} ·{" "}
                      {q.ownerName}
                    </small>
                    <small>{q.questionText}</small>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {(q.isOwner ||
                        roleName === "hod" ||
                        roleName === "admin" ||
                        roleName === "system_admin") &&
                        QUESTION_ACTIONS.filter((act) => act.from === q.status).map(
                          (act) => (
                            <button
                              key={act.to}
                              type="button"
                              className="quiet-button"
                              disabled={busy}
                              onClick={() =>
                                onStatusChange("questions", q.id, act.to)
                              }
                            >
                              {act.label}
                            </button>
                          )
                        )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "papers" && (
        <div className="activity-panel">
          <p className="card-label">Question papers ({papers.length})</p>
          {papers.length === 0 ? (
            <p className="muted-copy" style={{ padding: "16px 0" }}>
              No papers yet.
            </p>
          ) : (
            <div className="activity-list">
              {papers.map((p) => (
                <div className="activity-item" key={p.id}>
                  <span className="activity-marker marker-green" />
                  <div>
                    <strong>
                      {p.title} <span className="status-pill">{p.status}</span>
                    </strong>
                    <small>
                      {p.paperKind} · {p.subjectName}
                      {p.sectionName ? ` · ${p.sectionName}` : ""} ·{" "}
                      {p.totalMarks} marks · {p.itemCount} item(s) ·{" "}
                      {p.ownerName}
                    </small>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {(p.isOwner ||
                        roleName === "hod" ||
                        roleName === "admin" ||
                        roleName === "system_admin") &&
                        PAPER_ACTIONS.filter((act) => act.from === p.status).map(
                          (act) => (
                            <button
                              key={act.to}
                              type="button"
                              className="quiet-button"
                              disabled={busy}
                              onClick={() => onStatusChange("papers", p.id, act.to)}
                            >
                              {act.label}
                            </button>
                          )
                        )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "mst" && (
        <div className="activity-panel">
          <p className="card-label">Mid-semester tests ({msts.length})</p>
          {msts.length === 0 ? (
            <p className="muted-copy" style={{ padding: "16px 0" }}>
              No MST records yet.
            </p>
          ) : (
            <div className="activity-list">
              {msts.map((m) => (
                <div className="activity-item" key={m.id}>
                  <span className="activity-marker marker-green" />
                  <div>
                    <strong>
                      MST-{m.mstNumber}: {m.title}{" "}
                      <span className="status-pill">{m.status}</span>
                    </strong>
                    <small>
                      {m.subjectName} · {m.sectionName} · {m.academicYear} ·{" "}
                      {m.maxMarks} marks
                      {m.scheduledOn ? ` · ${m.scheduledOn}` : ""}
                      {m.questionPaperId ? " · paper linked" : ""}
                    </small>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {(m.isOwner ||
                        roleName === "hod" ||
                        roleName === "admin" ||
                        roleName === "system_admin") &&
                        MST_ACTIONS.filter((act) => act.from === m.status).map(
                          (act) => (
                            <button
                              key={act.to}
                              type="button"
                              className="quiet-button"
                              disabled={busy}
                              onClick={() => onStatusChange("mst", m.id, act.to)}
                            >
                              {act.label}
                            </button>
                          )
                        )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {submissionFor && (
        <div
          className="coming-soon-panel"
          style={{ marginTop: 24 }}
          role="region"
          aria-label="Submissions"
        >
          <p className="panel-label">
            Submissions — {submissionFor.title}
          </p>
          <button
            type="button"
            className="quiet-button"
            onClick={() => {
              setSubmissionFor(null);
              setSubmissions([]);
            }}
          >
            Close
          </button>

          {isStudent && (
            <form className="auth-form" onSubmit={onSubmitWork} style={{ marginTop: 12 }}>
              <label className="auth-field">
                <span>Your answer</span>
                <textarea
                  rows={4}
                  value={contentText}
                  onChange={(e) => setContentText(e.target.value)}
                  required
                  placeholder="Write your submission…"
                />
              </label>
              <button className="auth-submit" type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit attempt"}
              </button>
            </form>
          )}

          <div className="activity-list" style={{ marginTop: 12 }}>
            {submissions.length === 0 ? (
              <p className="muted-copy">No submissions yet.</p>
            ) : (
              submissions.map((s) => (
                <div className="activity-item" key={s.id}>
                  <span className="activity-marker marker-green" />
                  <div>
                    <strong>
                      {isStudent ? s.assignmentTitle : s.studentName}{" "}
                      <span className="status-pill">{s.status}</span>{" "}
                      <small>attempt {s.attemptNumber}</small>
                    </strong>
                    <small>{s.contentText}</small>
                    {s.score !== null && <small>Score: {s.score}</small>}
                    {s.feedback && <small>Feedback: {s.feedback}</small>}
                    {!isStudent &&
                      (s.status === "submitted" || s.status === "graded") && (
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            marginTop: 6,
                          }}
                        >
                          <input
                            type="number"
                            min={0}
                            style={{ width: 80 }}
                            placeholder="Score"
                            value={scoreDraft[s.id] ?? ""}
                            onChange={(e) =>
                              setScoreDraft((d) => ({
                                ...d,
                                [s.id]: e.target.value,
                              }))
                            }
                          />
                          <input
                            style={{ flex: 1, minWidth: 140 }}
                            placeholder="Feedback"
                            value={feedbackDraft[s.id] ?? ""}
                            onChange={(e) =>
                              setFeedbackDraft((d) => ({
                                ...d,
                                [s.id]: e.target.value,
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="quiet-button"
                            disabled={busy}
                            onClick={() => onReview(s, "grade")}
                          >
                            Grade
                          </button>
                          <button
                            type="button"
                            className="quiet-button"
                            disabled={busy}
                            onClick={() => onReview(s, "return")}
                          >
                            Return
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <p className="muted-copy" style={{ marginTop: 12 }}>
        Signed in as {roleName} ({userId.slice(0, 8)}…).
      </p>
    </div>
  );
}
