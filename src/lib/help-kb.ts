/**
 * Campus Skill Help knowledge base (Milestone 12).
 * Role + module aware, structured for future AI retrieval (ids, tags, roles).
 * Static content only — never fabricates capabilities that are not shipped.
 * No AI key required to use this base.
 */

export type HelpArticle = {
  id: string;
  title: string;
  summary: string;
  body: string;
  module: string;
  roles: string[];
  tags: string[];
  relatedIds?: string[];
};

export const HELP_MODULES = [
  "getting-started",
  "dashboard",
  "academics",
  "placement",
  "institution",
  "ai",
  "account",
  "privacy",
  "import-export",
  "announcements",
  "help",
] as const;

export type HelpModule = (typeof HELP_MODULES)[number];

const ALL_AUTHENTICATED = [
  "student",
  "faculty",
  "hod",
  "admin",
  "director_dean",
  "system_admin",
  "tpo",
  "recruiter",
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "gs-welcome",
    title: "Welcome to Campus Skill",
    summary:
      "Campus Skill is your institution's academic workspace: subjects, notes, assignments, calendar, placement, and more in one place.",
    body: "Sign in with the email your institution registered. Your role (student, faculty, HOD, admin, Director/Dean, TPO, or system administrator) decides which tools you see. Navigation is personalized, but every action is checked on the server — if something is missing, your role may not have access yet. Start at the Dashboard for an overview of your day.",
    module: "getting-started",
    roles: ALL_AUTHENTICATED,
    tags: ["start", "welcome", "roles"],
    relatedIds: ["gs-nav", "acc-recover"],
  },
  {
    id: "gs-nav",
    title: "Using the sidebar navigation",
    summary:
      "The left sidebar lists the modules your role can use. On phones, open the menu icon at the top.",
    body: "Active items are highlighted. On screens narrower than 680px the sidebar collapses — tap the hamburger icon to open it, then tap a link. Items you do not see are limited to other roles; this does not change what the server will allow. Notifications live under the bell icon and the Notifications page.",
    module: "getting-started",
    roles: ALL_AUTHENTICATED,
    tags: ["navigation", "responsive", "sidebar"],
  },
  {
    id: "dash-overview",
    title: "Dashboard overview",
    summary:
      "Your dashboard shows role-specific cards with real counts from your institution — no fake statistics.",
    body: "Students see enrolled subjects, pending submissions, and today's activity. Faculty see review queues and teaching load. HODs and Directors see approval queues scoped to their authority. Empty cards mean there is no data yet — not an error. Use the quick-action cards to jump into common workflows.",
    module: "dashboard",
    roles: ALL_AUTHENTICATED,
    tags: ["dashboard", "overview", "cards"],
    relatedIds: ["gs-nav"],
  },
  {
    id: "ac-subjects",
    title: "My Subjects (students)",
    summary:
      "Open enrolled subjects, assignments, notes, syllabus, and resources from My Subjects.",
    body: "My Subjects lists subjects from your active enrollment. Inside a subject workspace you see your assignment status and feedback, published resources, syllabus structure, and test papers. If the list is empty, your enrollment for the current semester may not be active yet — contact your admin or faculty.",
    module: "academics",
    roles: ["student"],
    tags: ["subjects", "enrollment", "student"],
    relatedIds: ["ac-assignments", "ac-syllabus"],
  },
  {
    id: "ac-assignments",
    title: "Assignments and submissions",
    summary:
      "Students submit work; faculty review submissions and give feedback.",
    body: "Open Assignments to see work due for your subjects or courses you teach. Students attach a submission before the deadline when submission is open. Faculty open an assignment to review submissions, enter a score, and leave feedback. Late and missing items appear on the dashboard with real status — nothing is auto-graded unless a scoring rule is part of the assignment.",
    module: "academics",
    roles: ["student", "faculty", "hod", "admin", "director_dean"],
    tags: ["assignments", "submission", "feedback"],
    relatedIds: ["ac-subjects"],
  },
  {
    id: "ac-syllabus",
    title: "Syllabus and units",
    summary:
      "Faculty and HODs maintain syllabus structure; students read published versions.",
    body: "Syllabi are organized into units and topics. Faculty create and update draft syllabi; approval steps follow your institution's workflow (creator cannot approve their own draft). Students only see published syllabi for their program/semester. Version history preserves earlier approved states.",
    module: "academics",
    roles: ["student", "faculty", "hod", "admin", "director_dean"],
    tags: ["syllabus", "units", "approval"],
    relatedIds: ["ac-assignments"],
  },
  {
    id: "ac-calendar",
    title: "Calendar and daily work",
    summary:
      "Track academic events and daily work reports for your role.",
    body: "Calendar holds institutional and personal academic events. Faculty and HODs use Daily Work to log teaching and department activity. Events and reports respect institution and department scope — you only see what your role is authorized to see.",
    module: "academics",
    roles: [
      "student",
      "faculty",
      "hod",
      "admin",
      "director_dean",
      "system_admin",
    ],
    tags: ["calendar", "daily work", "events"],
  },
  {
    id: "pl-student",
    title: "Placement opportunities (students)",
    summary:
      "Browse open opportunities, apply, track interviews and offers.",
    body: "Placement lists open job/internship opportunities you are eligible for. Apply before the deadline; your application status updates through shortlisting, interview, and offer stages. Your career profile (skills and interests) helps operators understand fit. Only you can see your own application history in detail.",
    module: "placement",
    roles: ["student"],
    tags: ["placement", "apply", "opportunity"],
    relatedIds: ["pl-tpo"],
  },
  {
    id: "pl-tpo",
    title: "Placement operations (TPO / staff)",
    summary:
      "Manage companies, opportunities, appointments, and approval queues.",
    body: "TPOs create companies and opportunities in the institution; Director/Dean approves companies and sensitive steps. Faculty with a placement responsibility work within their department scope. Students apply only to open, eligible opportunities. Appointment requests (TPO / placement faculty) require Director/Dean approval — you cannot approve a request you created.",
    module: "placement",
    roles: ["tpo", "faculty", "hod", "admin", "director_dean"],
    tags: ["placement", "tpo", "approval", "company"],
    relatedIds: ["pl-student"],
  },
  {
    id: "inst-control",
    title: "Institution Control Center",
    summary:
      "Admins configure profile, branding, modules, and onboarding; Directors approve sensitive changes.",
    body: "Under Institution: Profile and contact details, branding colors and taglines, public profile fields, feature modules, users directory, structure counts, audit trail, and a multi-step onboarding checklist. Direct areas save immediately with audit. Sensitive areas (modules, security, integrations, advanced) follow Draft → Review → Approve → Publish. System administrators get technical read-only access and never institution config write power.",
    module: "institution",
    roles: ["admin", "director_dean", "system_admin"],
    tags: ["institution", "branding", "modules", "audit"],
    relatedIds: ["ie-import", "ie-export", "acc-lifecycle"],
  },
  {
    id: "inst-public",
    title: "Public institution directory",
    summary:
      "A public page can show only fields you explicitly mark as public.",
    body: "Institution → Public controls which contact and profile fields appear on the public directory (no signed-in session required). Only selected keys are exposed — internal config, emails you did not publish, and module flags never appear publicly.",
    module: "institution",
    roles: ["admin", "director_dean"],
    tags: ["public", "directory", "privacy"],
    relatedIds: ["priv-notices"],
  },
  {
    id: "acc-recover",
    title: "Forgot your password?",
    summary: "Request a reset link from the sign-in page and set a new password.",
    body: "On Sign in, choose Forgot password and enter your email. If the account exists, a reset link is emailed (or provided by your administrator in environments without outbound email). Open the link and choose a new password. Links expire — request a new one if it fails. After resetting, sign in with the new password.",
    module: "account",
    roles: ALL_AUTHENTICATED,
    tags: ["password", "reset", "sign-in"],
    relatedIds: ["acc-verify", "acc-lifecycle"],
  },
  {
    id: "acc-verify",
    title: "Email verification",
    summary: "Verify your email so account recovery and notices work reliably.",
    body: "After sign-up, Campus Skill can send a verification link. Open it to mark the email verified. In environments without outbound email, an administrator can guide you through the verification foundation. Unverified email does not by itself block an active profile, but recovery flows depend on a working mailbox.",
    module: "account",
    roles: ALL_AUTHENTICATED,
    tags: ["email", "verify", "account"],
    relatedIds: ["acc-recover"],
  },
  {
    id: "acc-lifecycle",
    title: "Account statuses (suspend, graduate, leave)",
    summary:
      "Admins and Directors/Deans manage active, suspended, inactive, graduated, and left statuses.",
    body: "Only active profiles can use the workspace. Suspended, inactive, graduated, left, deactivated, or pending accounts are blocked at sign-in context. Status changes are history-preserving (academic records are never deleted) and audited. You cannot suspend your own account. Deactivated profiles are not resurrected on next login.",
    module: "account",
    roles: ["admin", "director_dean", "system_admin"],
    tags: ["lifecycle", "suspend", "status", "admin"],
    relatedIds: ["inst-control", "acc-recover"],
  },
  {
    id: "priv-notices",
    title: "Privacy, AI notice, and consent",
    summary:
      "Institutions publish privacy wording; users acknowledge notices from Profile → Privacy.",
    body: "Your institution may configure a privacy notice, data-handling notice, AI notice, and terms acknowledgement text. Acknowledgements are recorded with version and timestamp for your account only. AI assistance (when enabled) shows integrity disclaimers and never guarantees grades or plagiarism-free work. Usage metadata may be logged — prompt content is not stored in this foundation.",
    module: "privacy",
    roles: ALL_AUTHENTICATED,
    tags: ["privacy", "consent", "ai", "terms"],
    relatedIds: ["ai-basics", "inst-control"],
  },
  {
    id: "ie-import",
    title: "Bulk import (CSV)",
    summary:
      "Admins upload CSV, validate rows, preview, approve, then import — with audit.",
    body: "Institution → Import: choose an entity (students, faculty, departments, programs…), upload CSV text, review validation errors, approve the job, then run it. Only validated rows write to live structure tables. Student/faculty imports never set passwords — accounts still go through sign-up or admin provisioning. Excel users export CSV from their spreadsheet first.",
    module: "import-export",
    roles: ["admin", "director_dean"],
    tags: ["import", "csv", "bulk", "validation"],
    relatedIds: ["ie-export", "inst-control"],
  },
  {
    id: "ie-export",
    title: "Controlled data export",
    summary:
      "Allowed roles export allow-listed entities as CSV or JSON; every export is audited.",
    body: "Export is limited to institution admin, Director/Dean, HOD, and TPO for an allow-list of entities (students, faculty, structure, enrollments, assignments, announcements). TPO cannot export enrollment history or assignments. There is no unrestricted database dump. Each run records an export job and audit entry.",
    module: "import-export",
    roles: ["admin", "director_dean", "hod", "tpo"],
    tags: ["export", "csv", "json", "audit"],
    relatedIds: ["ie-import", "inst-control"],
  },
  {
    id: "ann-how",
    title: "Announcements",
    summary:
      "Staff publish targeted announcements; students see only what matches their audience.",
    body: "Admins, Directors, HODs, faculty, and TPOs can create announcements for institution, department, program, semester, section, faculty, or students audiences. HOD announcements must target their department. Publishing fans out in-app notifications to matching active profiles. Students only list published announcements that match their enrollment/audience.",
    module: "announcements",
    roles: [
      "student",
      "faculty",
      "hod",
      "admin",
      "director_dean",
      "tpo",
      "system_admin",
    ],
    tags: ["announcements", "notifications", "audience"],
    relatedIds: ["dash-overview"],
  },
  {
    id: "ai-basics",
    title: "AI Assist basics",
    summary:
      "Role-scoped AI help for explanations, teaching support, and summaries — when a provider is configured.",
    body: "AI Assist offers action chips matched to your role (students: explain/summarize/revise; faculty: lesson and assignment help; HOD/Director/TPO: scoped summaries). Context IDs are re-checked on the server before any text is sent to the provider. Without provider credentials the workspace uses a deterministic local guidance fallback and labels it clearly — it does not invent an AI model. AI never assigns grades, admissions, or disciplinary decisions. Prompt content is not persisted; usage metadata may be.",
    module: "ai",
    roles: [
      "student",
      "faculty",
      "hod",
      "admin",
      "director_dean",
      "tpo",
      "system_admin",
    ],
    tags: ["ai", "assist", "fallback", "integrity"],
    relatedIds: ["priv-notices"],
  },
  {
    id: "help-using",
    title: "How to use this Help center",
    summary: "Browse by role and module, search tags, or follow related articles.",
    body: "This help center is static and role-aware: you only see articles written for your role. Content is structured (id, module, roles, tags) so a future AI retrieval layer can index it without rewriting the knowledge. Nothing here is generated on the fly — if a feature is not shipped, it is not described as available. For account issues, start with password recovery; for institution setup, start with the Institution Control Center.",
    module: "help",
    roles: ALL_AUTHENTICATED,
    tags: ["help", "kb", "search"],
    relatedIds: ["gs-welcome", "acc-recover"],
  },
];

export function filterHelpArticles(input: {
  roleName?: string | null;
  module?: string | null;
  q?: string | null;
}): HelpArticle[] {
  const role = (input.roleName || "").trim();
  const moduleFilter = (input.module || "").trim();
  const q = (input.q || "").trim().toLowerCase();

  return HELP_ARTICLES.filter((a) => {
    if (role && !a.roles.includes(role)) return false;
    if (moduleFilter && a.module !== moduleFilter) return false;
    if (q) {
      const hay = `${a.title} ${a.summary} ${a.body} ${a.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).map((a) => ({
    ...a,
    body: a.body,
  }));
}

export function getHelpArticle(
  id: string,
  roleName?: string | null
): HelpArticle | null {
  const found = HELP_ARTICLES.find((a) => a.id === id);
  if (!found) return null;
  if (roleName && !found.roles.includes(roleName)) return null;
  return found;
}

export function helpModulesForRole(roleName?: string | null): HelpModule[] {
  const used = new Set<HelpModule>();
  for (const a of HELP_ARTICLES) {
    if (!roleName || a.roles.includes(roleName)) {
      used.add(a.module as HelpModule);
    }
  }
  return HELP_MODULES.filter((m) => used.has(m));
}
