"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const AUDIENCES = [
  { value: "institution", label: "Entire institution" },
  { value: "department", label: "Department" },
  { value: "program", label: "Program" },
  { value: "section", label: "Section" },
  { value: "faculty", label: "Faculty & staff" },
  { value: "students", label: "Students" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function AnnouncementActions({ roleName }: { roleName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [audienceKind, setAudienceKind] = useState(
    roleName === "hod" ? "department" : "institution"
  );
  const [scopeId, setScopeId] = useState("");
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title,
        body,
        priority,
        audienceKind,
        publish,
      };
      if (audienceKind === "department" && scopeId) payload.departmentId = scopeId;
      if (audienceKind === "program" && scopeId) payload.programId = scopeId;
      if (audienceKind === "section" && scopeId) payload.sectionId = scopeId;

      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Unable to create announcement.");
        return;
      }
      setSuccess(
        publish
          ? "Announcement published."
          : "Draft saved. Publish from the list when ready."
      );
      setTitle("");
      setBody("");
      setScopeId("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft(id: string) {
    setError(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "publish" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.message || "Unable to publish.");
        return;
      }
      router.refresh();
    } catch {
      setError("Unable to publish.");
    }
  }

  void publishDraft;

  return (
    <section className="dash-panel" style={{ marginBottom: 16 }}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">compose</p>
          <h2>New announcement</h2>
        </div>
        <button
          className="quiet-button"
          type="button"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Open composer"}
        </button>
      </div>
      {open && (
        <form className="placement-form" onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <label className="placement-field">
            <span>Title</span>
            <input
              required
              minLength={3}
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Mid-semester exam schedule"
            />
          </label>
          <label className="placement-field">
            <span>Body</span>
            <textarea
              rows={4}
              maxLength={5000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Details for your audience…"
            />
          </label>
          <div className="placement-field-row">
            <label className="placement-field">
              <span>Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="placement-field">
              <span>Audience</span>
              <select
                value={audienceKind}
                onChange={(e) => setAudienceKind(e.target.value)}
                disabled={roleName === "hod"}
              >
                {AUDIENCES.filter(
                  (a) =>
                    roleName !== "hod" ||
                    a.value === "department"
                ).map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            {(audienceKind === "department" ||
              audienceKind === "program" ||
              audienceKind === "section") && (
              <label className="placement-field">
                <span>
                  {audienceKind === "department"
                    ? "Department ID"
                    : audienceKind === "program"
                      ? "Program ID"
                      : "Section ID"}
                </span>
                <input
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  placeholder="UUID from your institution structure"
                  required
                />
              </label>
            )}
          </div>
          <label className="placement-check">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
            />
            Publish immediately (fan out notifications)
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="placement-success" role="status">
              {success}
            </p>
          )}
          <div>
            <button className="auth-submit" type="submit" disabled={saving}>
              {saving ? "Saving…" : publish ? "Publish" : "Save draft"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
