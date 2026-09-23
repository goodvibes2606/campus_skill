# Changelog

## 2026-09-23

### Milestone 8 — Student Academic System
- Added `src/lib/student-academics.ts`: server-side enrolled subjects from active enrollment → `section_subjects`; subject workspace loader that rejects subject IDs outside the enrolled section; own-submission summaries (latest attempt per assignment); academic-first notification ordering. No client-supplied IDs trusted for scope.
- Added `/subjects` (My Subjects hub): enrollment context, real counts (enrolled subjects, pending submissions), subject cards linking to workspaces, empty states for no enrollment / no subject links, quick links to assignments/notes/syllabus.
- Added `/subjects/[subjectId]` subject workspace: assignments with own submission status/feedback, published resources, published syllabus structure (units/topics — no fabricated progress percentages), MST & published papers, loading skeleton, signed-out and authorization-denied states.
- Enhanced student dashboard: enrolled subjects link to `/subjects/[id]`, “Open my subjects” + “My subjects” quick action, academic-priority notification ordering (recipient-only).
- Added student-only “My Subjects” nav item (UX filter only; routes remain server-authorized).
- Integrated existing submission flow into `/assignments`: one server-side own-submission query surfaces “my work” status/score/feedback beside each assignment (student display only; faculty review UI unchanged).
- Verified: `npm run lint`, `npx tsc --noEmit`, `npm run build` clean; rollback-only DB check confirmed enrolled-subjects query (`ROLLBACK_OK`); working tree uncommitted. Limitation: live DB has 0 enrollments/0 subjects — full signed-in student UI flow not exercised against real seed data.

### Milestone 7 — Dashboard & System Integration
- Added server-side role-aware dashboard loader `src/lib/dashboard.ts` composing existing visibility-filtered services (assignments, resources, syllabus, calendar, notifications, MST, question papers, daily work) plus institution/department-scoped approval queries. No synthetic statistics — cards show real rows/counts; empty arrays render empty states.
- Student dashboard: enrollment context, enrolled subjects (`section_subjects`), today’s activity, pending/missing submissions, syllabus, resources, assignments/papers/MST, calendar, notifications, quick actions. Empty enrollment state when no active enrollment.
- Faculty dashboard: today’s calendar/daily work/review queue, active teaching assignments, submissions awaiting review (owner + active assignment + HOD department), resources, syllabus, assessments, daily work, calendar, notifications.
- HOD dashboard: headed departments, faculty overview, pending academic approvals (syllabus/paper/MST/calendar/daily work scoped to headship), department resources/assessments, calendar, notifications. No Director/admin promotion.
- Director/Dean + institution admin dashboard: institution overview counts (departments/programs/faculty/students/active HODs), pending institutional approvals, HOD summaries, official institutional information, calendar, notifications.
- System Admin dashboard: technical/institutional administration only (profile status, institution scope, separation notice, notifications) — deliberately does **not** surface academic approval queues or grant HOD/Director academic authority in the UI.
- Rebuilt `/` home as role-aware server component with sign-in prompt, load-error recovery panel, and role-specific sections/quick actions.
- Role-aware navigation in `AppShell` (Daily Work hidden from students; Thesis Mentor student-only; system admin limited to Dashboard/Calendar/Notifications/Profile); topbar/sidebar workspace labels by role. Server-side authz unchanged — nav filtering is UX only.
- Layout passes `roleName` from `getAuthContext` (DB-backed, never client-supplied).
- Added route `loading.tsx` skeleton and root `error.tsx` boundary; additive CSS for dashboard panels, empty states, and skeletons (existing visual language preserved; responsive 2-col → 1-col).
- Verified: lint, production build, role-based dashboard/nav paths, authorization boundaries unchanged (no migration, no secret/config change, no commit).

### Milestone 6 — Academic Assessment
- Added additive migration `006_academic_assessment`: `assignments` (full academic scope chain, lifecycle draft/published/closed/archived, due/max_points/resubmit/version), `assignment_submissions` (history-preserving attempts with unique per assignment+student+attempt; draft/submitted/returned/graded + faculty score/feedback), `question_bank_items` (draft/approved/retired approval foundation; mcq/short/long/numerical/true_false), `question_papers` (draft→in_review→approved→published→archived with approval/publish actors), `question_paper_items` (ordered questions with text snapshot from bank), and `mid_semester_tests` (MST-1/MST-2 with lifecycle + optional linked paper; one MST-N per section+subject+academic_year). Table name `assessments` intentionally not used (reserved for case-study simulator in DATABASE_SPEC §2).
- Implemented assignment services with server-side visibility: students see published/closed work in active enrollment only and may only access their own submissions; faculty own + active teaching assignment (section+subject); HOD headed departments; admin institution. Faculty review grades or returns work; score capped by max_points; attempts never hard-deleted.
- Implemented question bank + paper review/approval foundation: students cannot browse the bank (answer keys); paper approval requires HOD/admin; publish requires approved first; paper items snapshot question text and recompute total_marks.
- Implemented MST-1/MST-2 records with optional linked question paper creation, approval by HOD/admin, and publish only after approval.
- Added APIs: `/api/assignments`, `/api/assignments/[id]`, `/api/assignments/[id]/submissions`, `/api/assignments/[id]/submissions/[submissionId]`, `/api/question-bank`, `/api/question-bank/[id]`, `/api/question-papers`, `/api/question-papers/[id]`, `/api/question-papers/[id]/items`, `/api/msts`, `/api/msts/[id]`.
- Rebuilt `/assignments` as a server-filtered page with tabbed UI (Assignments | Questions | Papers | MST) supporting create, status transitions, student submit, and faculty grade/return.

### Milestone 5 — Academic Operations
- Added additive migration `005_academic_operations`: `syllabi` (subject + academic year + version + lifecycle + source provenance), `syllabus_versions` (immutable snapshots), `syllabus_units`, `syllabus_topics`, `academic_calendar_events` (institutional dates + approval + circulation fields), `daily_work_reports` / `daily_work_items` (faculty/HOD reporting), core `notifications` (event/recipient/read/priority/timestamp), and independent `notification_channel_deliveries` (no vendor hard-coding).
- Implemented syllabus services with server-side visibility, status lifecycle (`draft → in_review → approved → published → archived`), unit/topic editing, and version snapshots. Source fields record provenance only — no official university syllabus content is invented; official flag restricted to HOD/admin.
- Implemented academic calendar approval foundation (`draft → pending_approval → approved → published` with reject/withdraw paths); publish sets circulation fields and fans out in-app notifications.
- Implemented daily work create/submit/acknowledge/return for faculty/HOD/admin with HOD department scoping.
- Implemented reusable notification model (list unread, mark read by recipient only) with channel enqueue separated in `notification-channels.ts` (WhatsApp/messaging vendors not hard-coded).
- Added APIs: `/api/syllabi`, `/api/syllabi/[id]`, `/api/syllabi/[id]/units`, `/api/syllabi/[id]/versions`, `/api/syllabus-units/[id]/topics`, `/api/calendar`, `/api/calendar/[id]`, `/api/daily-work`, `/api/daily-work/[id]`, `/api/notifications`, `/api/notifications/[id]`.
- Added minimal UI: `/syllabus`, `/calendar`, `/daily-work`, `/notifications` + nav links; notifications bell links to `/notifications`.

### Milestone 4 — Academic Resource Foundation
- Added additive migration `004_academic_resources`: `academic_resources` with full academic scope (Institution → University → Department → Program → Academic Year → Semester → Section → Subject), optional syllabus/unit/topic refs, status lifecycle (draft/published/archived), version field, and nullable upload metadata (`storage_key` deferred with storage milestone).
- Implemented server-side resource visibility in `src/lib/resources.ts`: students see only published resources inside their active enrollment context; faculty see own + active assignment (section+subject) + coordinator sections; HOD adds headed departments; admin is institution-scoped; system_admin is cross-institution.
- Added create/update authorization: only faculty/HOD/admin may create within scope; owner/HOD/admin may change status; content edits bump `version`.
- Added upload validation foundation in `src/lib/resource-types.ts` (type/MIME/size) without storing file bytes.
- Added APIs: `GET/POST /api/resources`, `GET/PATCH /api/resources/[id]`.
- Rebuilt `/notes` as a server component that filters before render; added minimal `ResourceBrowser` client for list/create/status actions.
- Verified: lint clean, production build clean, migration idempotent re-run, relationship test (transaction + ROLLBACK_OK), authz matrix AUTHZ_PASS, E2E E2E_PASS (401/403/200 paths), git diff clean (no secrets, `.env.local` ignored).

### Milestone 3 — Student + Faculty Academic Relationships
- Added additive migration `003_academic_relationships`: `student_enrollments` (history-preserving, one active per student), `faculty_assignments` (full Faculty→…→Subject chain with history), `department_heads` (HOD scope with handover history).
- Implemented enrollment, faculty assignment, coordinator, and department-head services with handover protocols (old → ENDED, new → ACTIVE; never overwrite history).
- Extended server-side authorization in `src/lib/academic-scope.ts`: student enrollment boundaries, faculty assignment boundaries, HOD department/institution scope, enrollment/assignment/coordinator permission gates.
- Added APIs: `GET /api/academic/context`, `POST/GET /api/enrollments`, `POST/GET /api/faculty-assignments`, `POST/GET /api/coordinators`, `POST/GET /api/department-heads`.

### Milestone 2 — Academic Identity + RBAC Foundation
- Added additive migration `002_academic_hierarchy_rbac`: universities, departments, programs, academic_years, semesters, sections, section_coordinators, subjects, section_subjects (all with institution_id + lifecycle status).
- Seeded roles: `hod`, `director_dean`, `system_admin` (existing student/faculty/admin reused).
- Class Coordinator modeled as section assignment + handover history, not a user role.
- Added server-side `src/lib/authz.ts`: `getAuthContext`, `requireAuth`, `requireRole`, institution isolation checks, scoped query helper.
- Added `GET /api/me` for server-side role/institution verification.

### Milestone 1 — Identity Foundation
- Added additive migration `001_identity_foundation` (institutions, roles, profiles, schema_migrations).
- Shared single `pg` pool with `withAuthQuery` / `queryWithAuth` helpers for transaction-local identity.
- Better Auth now uses the shared pool; first-login profile bootstrap via `databaseHooks.user.create.after` and `ensureProfile`.
- Added auth client, server session helpers, Next.js 16 `proxy.ts` route protection.
- Added `/sign-in` and `/sign-up` pages; app shell shows real session name/email and sign-out.
- Verified: lint, build, unauthenticated redirects, sign-up, profile linkage (role=student, institution pending), sign-in, sign-out.

## 2026-09-21

### Development Foundation
- Installed OpenCode 1.18.31.
- Configured MiMo V2.5 Free for initial development testing.
- Created AGENTS.md with CampusSkill development instructions.
- Committed the agent instructions.
