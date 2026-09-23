import Link from "next/link";

import { getAuthContext } from "@/lib/authz";
import { getCareerProfile } from "@/lib/placement-profile";
import { CareerProfileForm } from "@/components/placement/career-profile-form";

/**
 * Student career profile (Milestone 9).
 * Students edit only their own row (server-checked).
 */
export default async function CareerProfilePage() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Career profile</p>
            <h1>Sign in to view your profile</h1>
            <p className="page-description">
              Your career profile is private to your student account.
            </p>
          </div>
        </div>
        <a className="sign-in-link" href="/sign-in">
          Sign in
        </a>
      </div>
    );
  }

  if (ctx.roleName !== "student") {
    return (
      <div className="placeholder-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Career profile</p>
            <h1>Student career profile</h1>
            <p className="page-description">
              Career profiles are maintained by students. Staff can review
              readiness from placement oversight views.
            </p>
          </div>
        </div>
        <section className="coming-soon-panel">
          <div className="panel-line" />
          <p className="panel-label">Access</p>
          <h2>Student workspace only</h2>
          <p>Server-side authorization limits editing to the owning student.</p>
          <Link className="text-link" href="/placement">
            Back to placement <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </div>
    );
  }

  const profile = await getCareerProfile(ctx);

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Career profile</p>
          <h1>My placement profile</h1>
          <p className="welcome-copy">
            Keep skills, interests, and readiness current before you apply.
            Academic details stay on your enrollment — not duplicated here.
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span>✦</span>
        </div>
      </section>

      <CareerProfileForm
        initial={{
          headline: profile?.headline ?? "",
          summary: profile?.summary ?? "",
          skills: profile?.skills ?? [],
          careerInterests: profile?.career_interests ?? [],
          resumeReference: profile?.resume_reference ?? "",
          readiness: profile?.readiness ?? "not_started",
          enrollmentContext: profile?.enrollment_context ?? null,
        }}
      />
    </div>
  );
}
