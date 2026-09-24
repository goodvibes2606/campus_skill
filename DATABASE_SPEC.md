# CampusSkill — Database Specification

## Status

[TECHNICAL RECOMMENDATION]

## Scope

MVP database design only.

Future phases may add tables for internships, career readiness,
recruiter matching, payments, and advanced analytics.

---

# 1. Design Principles

- UUID primary keys for all tables
- `created_at` and `updated_at` timestamps on every table
- `institution_id` on all data tables to enable multi-tenant isolation
- Row-Level Security (RLS) enforced on every table
- No foreign keys that would block inserts during development — enforce
  relationships in application logic and RLS policies
- Authentication identity supplied transaction-locally by the application
  via `set_config('app.current_user_id', user.id, true)` and read
  inside PostgreSQL using `current_setting('app.current_user_id', true)::uuid`
- PostgreSQL `gen_random_uuid()` for UUID generation (built-in since PostgreSQL 13)

---

# 2. Tables

---

## 2.1 institutions

**Purpose:** Top-level organizational entity. All data is scoped to an
institution.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | Institution name |
| slug | text | URL-friendly identifier, unique |
| address | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Relationships:** Parent of departments, courses, profiles.

**Access:**

- Admin: full CRUD for their own institution
- Faculty/Student: read-only for their own institution

---

## 2.2 profiles

**Purpose:** Extends the Better Auth authentication user with role and
institutional affiliation. One profile per user. The profile `id` references
`auth.user.id` — both are UUID.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | References auth.user.id |
| institution_id | uuid (FK → institutions) | |
| role | text | 'student', 'faculty', 'admin' |
| full_name | text | |
| email | text | Denormalized from auth.user for queries |
| avatar_url | text | Nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Relationships:** Belongs to institution. Links Better Auth user to
CampusSkill role.

**Access:**

- User: read/write own profile
- Admin: read/write all profiles in their institution
- Faculty: read profiles in their institution

---

## 2.3 roles

**Purpose:** Lookup table defining available roles. Supports future role
expansion without schema changes.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | 'student', 'faculty', 'admin', (future: 'recruiter') |
| description | text | |
| is_active | boolean | Default true. Disable without deleting. |

**Relationships:** Referenced by profiles.role.

**Access:**

- All authenticated users: read
- Admin: CRUD

---

## 2.4 departments

**Purpose:** Academic departments within an institution.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| institution_id | uuid (FK → institutions) | |
| name | text | |
| code | text | Short code, unique per institution |
| is_active | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Relationships:** Parent of courses. Belongs to institution.

**Access:**

- Admin: full CRUD in their institution
- Faculty/Student: read-only in their institution

---

## 2.5 courses

**Purpose:** Academic courses within a department.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| department_id | uuid (FK → departments) | |
| institution_id | uuid (FK → institutions) | Denormalized for RLS |
| name | text | |
| code | text | Short code |
| duration_semesters | integer | |
| is_active | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Relationships:** Belongs to department. Parent of subjects.

**Access:**

- Admin: full CRUD in their institution
- Faculty/Student: read-only in their institution

---

## 2.6 subjects

**Purpose:** Individual subjects within a course. Students select
subjects to study. Case studies are linked to subjects.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| course_id | uuid (FK → courses) | |
| institution_id | uuid (FK → institutions) | Denormalized for RLS |
| name | text | e.g. 'Marketing Management' |
| code | text | Short code |
| description | text | |
| is_active | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Relationships:** Belongs to course. Parent of case_studies. Many-to-many
with students via student_subjects.

**Access:**

- Admin: full CRUD in their institution
- Faculty: read in their institution
- Student: read subjects they are enrolled in

---

## 2.7 student_subjects

**Purpose:** Join table linking students to the subjects they are
enrolled in. Enables subject selection and determines which case
studies a student can access.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| student_id | uuid (FK → profiles) | The enrolled student |
| subject_id | uuid (FK → subjects) | The subject enrolled in |
| institution_id | uuid (FK → institutions) | Denormalized for RLS |
| status | text | 'active', 'dropped', 'completed' |
| enrolled_at | timestamptz | When the student enrolled |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Relationships:** Belongs to student and subject. Enables many-to-many.

**Access:**

- Student: read/write own enrollments (enroll/drop)
- Faculty: read enrollments for students in their institution
- Admin: CRUD all enrollments in their institution

---

## 2.8 case_studies

**Purpose:** Real-world problems and scenarios for the Study-to-Job
Simulator. Each case study is linked to a subject and contains the
evaluation rubric.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| subject_id | uuid (FK → subjects) | |
| institution_id | uuid (FK → institutions) | Denormalized for RLS |
| title | text | |
| topic | text | Sub-topic within the subject |
| difficulty | text | 'beginner', 'intermediate', 'advanced' |
| situation | text | Background scenario |
| background | text | Supporting context |
| problem | text | The core problem to solve |
| student_task | text | What the student must do |
| expected_response_type | text | 'text', 'analysis', 'recommendation', etc. |
| evaluation_rubric | jsonb | Structured rubric with criteria and weights |
| rubric_version | integer | Version number. Starts at 1. Increment when rubric changes. |
| recommended_time_minutes | integer | |
| learning_objective | text | |
| skills | text[] | Array of relevant skill names |
| is_active | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Relationships:** Belongs to subject. Parent of assessments.

**Access:**

- Admin: full CRUD in their institution
- Faculty: CRUD in their institution
- Student: read-only (only active cases for their enrolled subjects)

---

## 2.9 assessments

**Purpose:** A student's attempt at a case study. Links a student to
a case study and records the submission status.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| student_id | uuid (FK → profiles) | The student attempting |
| case_study_id | uuid (FK → case_studies) | |
| institution_id | uuid (FK → institutions) | Denormalized for RLS |
| status | text | 'in_progress', 'submitted', 'evaluated' |
| submitted_at | timestamptz | When the student submitted |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Relationships:** Belongs to student and case_study. Parent of
student_answers and evaluations.

**Access:**

- Student: read/write own assessments only
- Faculty: read assessments for students in their institution
- Admin: read all in their institution

---

## 2.10 student_answers

**Purpose:** The student's actual response to a case study. Stores
the submitted text/content.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| assessment_id | uuid (FK → assessments) | |
| student_id | uuid (FK → profiles) | Denormalized for RLS |
| institution_id | uuid (FK → institutions) | Denormalized for RLS |
| answer_text | text | The student's written response |
| answer_data | jsonb | Structured answer data if needed |
| submitted_at | timestamptz | |
| created_at | timestamptz | |

**Relationships:** Belongs to assessment and student.

**Access:**

- Student: read/write own answers only
- Faculty: read answers for students in their institution
- Admin: read all in their institution

---

## 2.11 evaluations

**Purpose:** AI-generated evaluation of a student answer. Stores
structured rubric scores and feedback. Distinguished from faculty
verification.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| assessment_id | uuid (FK → assessments) | |
| student_id | uuid (FK → profiles) | Denormalized for RLS |
| institution_id | uuid (FK → institutions) | Denormalized for RLS |
| ai_provider | text | Which AI provider generated this |
| rubric_version | integer | Version of the rubric used for this evaluation |
| rubric_snapshot | jsonb | Snapshot of the rubric at time of evaluation. Immutable. |
| rubric_scores | jsonb | Per-criterion scores and weights |
| total_score | numeric(5,2) | Computed total |
| strengths | text[] | |
| areas_for_improvement | text[] | |
| explanation | text | AI explanation of the evaluation |
| recommended_next_activity | text | |
| is_ai_generated | boolean | Always true for initial implementation |
| faculty_verified | boolean | Default false. Set by faculty. |
| verified_by | uuid (FK → profiles) | Faculty who verified |
| verified_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Relationships:** Belongs to assessment and student. Verified by faculty.

**Access:**

- Student: read own evaluations
- Faculty: read evaluations for students in their institution; write
  faculty_verified, verified_by, verified_at
- Admin: read all in their institution

---

## 2.12 skills

**Purpose:** Skill definitions. Initially seeded with MVP skills only.
Extensible for future skill taxonomy.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | e.g. 'Problem Solving', 'Communication' |
| category | text | e.g. 'Analytical', 'Domain Skills' |
| description | text | |
| is_active | boolean | |
| created_at | timestamptz | |

**Relationships:** Referenced by skill_evidence.

**Access:**

- All authenticated users: read
- Admin: CRUD

---

## 2.13 skill_evidence

**Purpose:** Links a skill to a specific piece of student work
(evaluation, faculty feedback, or future internship activity).
This is the core of the Skill Passport — it accumulates evidence
over time.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| student_id | uuid (FK → profiles) | |
| skill_id | uuid (FK → skills) | |
| institution_id | uuid (FK → institutions) | Denormalized for RLS |
| evidence_type | text | 'evaluation', 'faculty_feedback', (future: 'internship') |
| evidence_id | uuid | FK to the source (evaluation id, feedback id, etc.) |
| score | numeric(5,2) | Skill score from this evidence |
| is_verified | boolean | Whether faculty has verified this evidence |
| verified_by | uuid (FK → profiles) | |
| verified_at | timestamptz | |
| created_at | timestamptz | |

**Relationships:** Belongs to student and skill. References an evidence
source by type + id (polymorphic).

**Access:**

- Student: read own skill evidence
- Faculty: read skill evidence for students in their institution;
  write is_verified, verified_by, verified_at
- Admin: read all in their institution

---

## 2.14 faculty_feedback

**Purpose:** Faculty-provided feedback on student work. Separate from
AI evaluations to maintain the distinction between AI-generated
results and faculty-verified assessments.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| student_id | uuid (FK → profiles) | The student receiving feedback |
| faculty_id | uuid (FK → profiles) | The faculty providing feedback |
| institution_id | uuid (FK → institutions) | Denormalized for RLS |
| assessment_id | uuid (FK → assessments) | Optional. Links to a specific assessment. |
| feedback_type | text | 'general', 'evaluation_review', 'verification' |
| content | text | The feedback text |
| score | numeric(5,2) | Optional faculty-assigned score |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Relationships:** Belongs to student, authored by faculty, optionally
links to assessment.

**Access:**

- Student: read feedback addressed to them
- Faculty: read/write feedback they authored; read feedback in their
  institution
- Admin: read all in their institution

---

## 2.15 activity_logs

**Purpose:** Records platform usage events for the admin MVP's basic
usage analytics. Stores login activity, feature adoption, and
significant user actions.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| institution_id | uuid (FK → institutions) | Denormalized for RLS |
| user_id | uuid (FK → profiles) | The user who performed the action |
| activity_type | text | 'login', 'case_started', 'case_submitted', 'evaluation_viewed', 'feedback_given', etc. |
| metadata | jsonb | Optional context (e.g. case_study_id, subject_id) |
| created_at | timestamptz | |

**Relationships:** References user and institution. Append-only —
rows are never updated or deleted.

**Access:**

- Student: append own rows only; no read
- Faculty: append own rows; read rows for their institution
- Admin: read all rows in their institution

---

# 3. Entity Relationship Summary

```text
institutions
  ├── departments
  │     └── courses
  │           └── subjects
  │                 ├── student_subjects ←→ profiles (student)
  │                 └── case_studies
  │                       └── assessments
  │                             ├── student_answers
  │                             └── evaluations
  ├── profiles (role: student/faculty/admin)
  │     ├── assessments (student)
  │     ├── student_answers (student)
  │     ├── evaluations (student, verified by faculty)
  │     ├── skill_evidence (student, verified by faculty)
  │     ├── faculty_feedback (authored by faculty)
  │     └── activity_logs (all roles)
  └── activity_logs

skills
  └── skill_evidence (links skill to student work)

roles (lookup table)
```

---

# 4. Row-Level Security Strategy

## 4.1 Core Principle

Every table has RLS enabled. The `institution_id` column is the primary
tenant isolation boundary. Users can only access rows belonging to
their institution.

## 4.2 Identity Mechanism

The authenticated user identity is supplied transaction-locally by the
application and stored in a PostgreSQL session variable:

```sql
-- Set by application before each database transaction
SELECT set_config('app.current_user_id', '<user-uuid>', true);
```

RLS policies read this value inside PostgreSQL:

```sql
current_setting('app.current_user_id', true)::uuid
```

The `true` argument scopes the setting to the current transaction only,
ensuring isolation even when using PgBouncer in transaction mode (Neon).

## 4.3 Helper Function

A PostgreSQL function `get_user_profile()` returns the
current user's profile row (role + institution_id). RLS policies
call this function to determine access.

```sql
CREATE OR REPLACE FUNCTION public.get_user_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM public.profiles
  WHERE id = current_setting('app.current_user_id', true)::uuid;
$$;
```

## 4.4 Policy Patterns

### Pattern A — Student owns row

```sql
-- Student can read/write their own rows
CREATE POLICY student_own_rows ON table_name
  FOR ALL
  USING (
    student_id = current_setting('app.current_user_id', true)::uuid
  );
```

### Pattern B — Same institution

```sql
-- User can read rows in their institution
CREATE POLICY institution_read ON table_name
  FOR SELECT
  USING (
    institution_id = (
      SELECT institution_id FROM profiles
      WHERE id = current_setting('app.current_user_id', true)::uuid
    )
  );
```

### Pattern C — Faculty in same institution

```sql
-- Faculty can read/write in their institution
CREATE POLICY faculty_institution ON table_name
  FOR ALL
  USING (
    institution_id = (
      SELECT institution_id FROM profiles
      WHERE id = current_setting('app.current_user_id', true)::uuid
        AND role = 'faculty'
    )
  );
```

### Pattern D — Admin in same institution

```sql
-- Admin has full access in their institution
CREATE POLICY admin_institution ON table_name
  FOR ALL
  USING (
    institution_id = (
      SELECT institution_id FROM profiles
      WHERE id = current_setting('app.current_user_id', true)::uuid
        AND role = 'admin'
    )
  );
```

## 4.5 Table-Level RLS Summary

| Table | Student | Faculty | Admin |
|---|---|---|---|
| institutions | Read own | Read own | Read/write own |
| profiles | Read/write own | Read all in institution | Read/write all in institution |
| roles | Read | Read | CRUD |
| departments | Read in institution | Read in institution | CRUD in institution |
| courses | Read in institution | Read in institution | CRUD in institution |
| subjects | Read enrolled | Read in institution | CRUD in institution |
| student_subjects | Read/write own enrollments | Read in institution | CRUD in institution |
| case_studies | Read active, enrolled subjects | CRUD in institution | CRUD in institution |
| assessments | Read/write own | Read in institution | Read in institution |
| student_answers | Read/write own | Read in institution | Read in institution |
| evaluations | Read own | Read in institution; write verification fields | Read in institution |
| skills | Read | Read | CRUD |
| skill_evidence | Read own | Read in institution; write verification fields | Read in institution |
| faculty_feedback | Read own (addressed to student) | Read/write own authored | Read in institution |
| activity_logs | Append own | Append own; read in institution | Read in institution |

## 4.6 Denormalization for RLS

`institution_id` is denormalized on most tables (even when a foreign key
path exists through parent tables) so that RLS policies can check
tenant isolation with a single column comparison instead of joining
through multiple tables.

---

# 5. MVP vs Future Phase

| Table | Phase |
|---|---|
| institutions | MVP |
| profiles | MVP |
| roles | MVP |
| departments | MVP |
| courses | MVP |
| subjects | MVP |
| student_subjects | MVP |
| case_studies | MVP |
| assessments | MVP |
| student_answers | MVP |
| evaluations | MVP |
| skills | MVP |
| skill_evidence | MVP |
| faculty_feedback | MVP |
| activity_logs | MVP |

All 15 tables are required for the MVP.

Future phases will add tables for:

- Phase 5: Content studio (course plans, lesson plans, question banks)
- Phase 6: Internship evidence
- Phase 7: Career readiness, resume, interview
- Phase 8: Recruiter matching
- Phase 9: Payments, analytics

---

# 6. Open Questions

[ASSUMPTION]

Faculty are assigned to specific subjects, not globally assigned to
all students in an institution.

---

# 7. Better Auth Tables vs CampusSkill Application Tables

## 7.1 Better Auth Tables (auth schema)

Better Auth manages its own tables in the `auth` schema. These are
created by Better Auth migrations and must not be modified by
CampusSkill application migrations.

| Table | Purpose |
|---|---|
| auth.user | User identity (id, name, email, emailVerified, image) |
| auth.session | Active sessions |
| auth.account | Auth providers linked to user (email/password, future OAuth) |
| auth.verification | Email verification tokens |

## 7.2 CampusSkill Application Tables (public schema)

All 15 CampusSkill tables defined in Section 2 live in the `public`
schema and are managed through version-controlled SQL migrations.

## 7.3 Identity Chain

```
auth.user.id  (UUID, Better Auth managed)
      ↓
profiles.id   (UUID, CampusSkill application table)
```

- `auth.user.id` is the Better Auth user identifier
- `profiles.id` references `auth.user.id` — both are UUID
- The CampusSkill profile represents the application-level
  student/faculty/admin identity associated with the authenticated
  Better Auth user
- Application code retrieves the user ID from the Better Auth session
  and uses it to look up the corresponding profile

## 7.4 Schema Separation

- Better Auth tables: managed by authentication system
- CampusSkill application schema: managed through our version-controlled
  SQL migrations in `migrations/`
- The two schemas are independent except that `profiles.id` references
  `auth.user.id`

## 7.5 Authentication Flow

1. User authenticates via Better Auth (email/password)
2. Better Auth creates/updates `auth.user`, `auth.session`, `auth.account`
3. Application code sets the transaction-local identity:
   `SELECT set_config('app.current_user_id', user.id, true)`
4. All subsequent queries in that transaction read the identity via:
   `current_setting('app.current_user_id', true)::uuid`
5. RLS policies enforce access control using this identity

---

# 8. Milestone 3 — Academic Relationship Tables

[CONFIRMED] — additive relationship layer on top of the M2 hierarchy.
Implemented in `migrations/003_academic_relationships.sql`.

## 8.1 student_enrollments

**Purpose:** History-preserving student enrollment.
Student → Institution → Program → Academic Year → Semester → Section.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| student_id | uuid (FK → profiles) | |
| institution_id | uuid (FK → institutions) | Denormalized for RLS |
| program_id | uuid (FK → programs) | |
| academic_year_id | uuid (FK → academic_years) | |
| semester_id | uuid (FK → semesters) | |
| section_id | uuid (FK → sections) | |
| status | text | active / completed / dropped / transferred |
| enrolled_at | timestamptz | |
| ended_at | timestamptz | Required when status ≠ active |
| enrolled_by | uuid (FK → profiles) | Optional |

**Constraints:** Partial unique index — at most one `active` enrollment per student.
History rows are never deleted.

**Access:**
- Student: read own; operate only within active enrollment
- Faculty/HOD/admin: read enrollments in their institution / section scope

## 8.2 faculty_assignments

**Purpose:** History-preserving faculty teaching assignment.
Faculty → Institution → Department → Program → Academic Year → Semester → Section → Subject → Subject Code (via `subjects.subject_code`).

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| faculty_id | uuid (FK → profiles) | |
| institution_id | uuid (FK → institutions) | |
| department_id | uuid (FK → departments) | |
| program_id | uuid (FK → programs) | |
| academic_year_id | uuid (FK → academic_years) | |
| semester_id | uuid (FK → semesters) | |
| section_id | uuid (FK → sections) | |
| subject_id | uuid (FK → subjects) | subject_code read from subjects |
| status | text | active / ended / transferred |
| assigned_at | timestamptz | |
| ended_at | timestamptz | Required when status ≠ active |
| assigned_by | uuid (FK → profiles) | |

**Constraints:** One active assignment per (faculty, section, subject) and per (section, subject).
`section_subjects.faculty_id` is a denormalized current pointer.

**Access:**
- Faculty: read own assignments; operate only within active assignments
- HOD: assign/end within headed department
- admin / system_admin: institution-scoped

## 8.3 department_heads

**Purpose:** HOD authorization scope with handover history.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| department_id | uuid (FK → departments) | |
| hod_id | uuid (FK → profiles) | |
| institution_id | uuid (FK → institutions) | |
| assigned_by | uuid (FK → profiles) | |
| valid_from | timestamptz | |
| valid_to | timestamptz | NULL = ACTIVE; set = ENDED |

**Constraints:** Partial unique index — at most one current HOD per department.

## 8.4 Coordinator handover (reuses section_coordinators)

Handover protocol:
1. Close current row → `valid_to = now()` (ENDED)
2. Insert new row → `valid_to IS NULL` (ACTIVE)
3. Update `sections.coordinator_id` pointer

History is never overwritten or deleted.

## 8.5 Application-level authorization (until RLS)

`src/lib/academic-scope.ts` enforces:
- Students: only their own active enrollment / section
- Faculty: only sections/subjects covered by active assignments
- HOD: only departments they currently head, within their institution
- Enrollment/assignment/coordinator gates: admin, system_admin, or scoped HOD/coordinator

---

# 9. Milestone 4 — Academic Resource Table

[CONFIRMED] — academic resource metadata foundation for Notes / study materials.
Implemented in `migrations/004_academic_resources.sql`.
File bytes are NOT stored yet (cloud/local storage deferred by research);
`storage_key` is nullable until a later storage milestone.

## 9.1 academic_resources

**Purpose:** One row per faculty/admin-owned academic resource
(notes, PPT, PDF, document, study material) scoped to the full academic chain.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| institution_id | uuid (FK → institutions) | Denormalized for isolation |
| university_id | uuid (FK → universities) | |
| department_id | uuid (FK → departments) | |
| program_id | uuid (FK → programs) | |
| academic_year_id | uuid (FK → academic_years) | |
| semester_id | uuid (FK → semesters) | |
| section_id | uuid (FK → sections) | |
| subject_id | uuid (FK → subjects) | subject_code via subjects |
| syllabus_ref | text | Optional organization |
| unit_ref | text | Optional |
| topic_ref | text | Optional |
| owner_id | uuid (FK → profiles) | Creator / content owner |
| resource_type | text | notes / ppt / pdf / document / study_material |
| title | text | 2–200 chars (app validation) |
| description | text | Default '' |
| status | text | draft / published / archived |
| version | integer | ≥ 1; increments on content edits |
| parent_resource_id | uuid (FK → academic_resources) | Version chains (future) |
| original_filename | text | Upload metadata foundation |
| mime_type | text | |
| size_bytes | bigint | ≥ 0 |
| storage_key | text | Nullable until storage milestone |
| created_at | timestamptz | |
| updated_at | timestamptz | Trigger-maintained |

**Access (application-level until RLS):**
- Student: read `published` only inside active enrollment (section + program + year + semester); never draft/archived of others
- Faculty: read/write own; read within active teaching assignment (section+subject); coordinator reads whole coordinated section
- HOD: all resources in departments they currently head (institution-scoped)
- Admin: all resources in own institution
- system_admin: any institution
- Create: faculty (active assignment or coordinator), HOD (headed department), admin/system_admin/director_dean — never students
- Status change: owner, HOD of department, admin
- Content edit (title/description/refs): owner or admin; bumps `version`

---

# 10. Milestone 5 — Academic Operations

[CONFIRMED] — additive operations layer. No existing syllabus/calendar/notification entities were duplicated (M4 only had free-text `syllabus_ref`/`unit_ref`/`topic_ref`).
Implemented in `migrations/005_academic_operations.sql`.

## 10.1 syllabi

**Purpose:** Subject + academic year syllabus with lifecycle, units/topics, and source provenance (not official content).

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| institution_id | uuid | Isolation |
| department_id / program_id | uuid | Via subject program |
| academic_year_id | uuid (FK) | |
| subject_id | uuid (FK) | subject_code via `subjects.subject_code` |
| title / description | text | |
| version | integer | ≥ 1; snapshots in `syllabus_versions` |
| status | text | draft / in_review / approved / published / archived |
| source_type | text | faculty_prepared / institution_supplied / imported / unverified |
| source_reference / source_notes | text | Provenance only |
| source_is_official | boolean | Default false; HOD/admin only may set true |
| created_by / submitted_* / approved_* / published_* | uuid/timestamptz | Lifecycle actors |

**Constraints:** unique `(subject_id, academic_year_id, version)`; unique published per `(subject_id, academic_year_id)`.
**Lifecycle:** `draft → in_review → approved → published → archived` (reject returns to draft; archived reopens to draft).
**Access:** Student sees published within active enrollment (program+year); faculty own + active subject/year assignment; HOD department; admin institution.

## 10.2 syllabus_versions / syllabus_units / syllabus_topics

- `syllabus_versions`: immutable snapshot per `(syllabus_id, version)` with status + source + change_note.
- `syllabus_units`: `unit_number` unique per syllabus; status active/archived.
- `syllabus_topics`: `topic_number` unique per unit; denormalized `syllabus_id`.
- Unit/topic edits blocked when parent syllabus is published/archived; owner/HOD/admin only.

## 10.3 academic_calendar_events

| Field | Type | Notes |
|---|---|---|
| institution_id | uuid | |
| department_id | uuid NULL | NULL = institution-wide |
| academic_year_id | uuid NULL | Optional |
| title / description | text | |
| event_type | text | event/holiday/exam/deadline/class_start/class_end/meeting/other |
| starts_on / ends_on | date | ends ≥ starts |
| status | text | draft / pending_approval / approved / rejected / published / archived |
| approval/rejection actors + note | | Foundation |
| circulated_by / circulated_at | | Set on publish (circulation foundation) |

**Lifecycle:** `draft → pending_approval → approved → published → archived`; reject → draft.
**Access:** Create faculty/HOD/admin; approve HOD(dept or institution-wide)/admin+; student reads published only.

## 10.4 daily_work_reports + daily_work_items

- Report: reporter + report_date unique, summary, status draft/submitted/acknowledged/returned, optional department_id.
- Items: work_type, optional subject/section, description, duration_minutes.
- Create: faculty/HOD/admin only. List: own always; HOD headed departments; admin institution.
- Acknowledge/return: HOD of department or admin. Notifications on submit and status changes.

## 10.5 notifications + notification_channel_deliveries

**Core model (channels excluded):**

| Field | Type | Notes |
|---|---|---|
| recipient_id | uuid | Server-side only recipient visibility |
| event | text | `domain.action` pattern |
| title / body | text | |
| priority | text | low / normal / high / urgent |
| read_at | timestamptz NULL | NULL = unread |
| created_at | timestamptz | Timestamp |

**Channels (independent):** `notification_channel_deliveries(notification_id, channel, status, external_ref, …)` — channel key free-form (1–40 chars). Application must not hard-code messaging vendors (no WhatsApp in core model/business rules). Foundation enqueues `pending` rows; transport workers deferred.

**Access:** List/mark-read = recipient only (403 otherwise).

## 11. Academic assessment (Milestone 6)

> Table name `assessments` is **reserved** (see §2) for the case-study simulator. Assessment tables below use distinct names: `assignments`, `assignment_submissions`, `question_bank_items`, `question_papers`, `question_paper_items`, `mid_semester_tests`.

## 11.1 assignments

Course assignment (distinct from `faculty_assignments` teaching assignment).

| Field | Type | Notes |
|---|---|---|
| institution…subject | uuid | Full academic scope chain (institution → … → section + subject) |
| owner_id / created_by | uuid | Faculty/HOD/admin creator |
| title / description / instructions | text | title 2–200 |
| status | text | draft / published / closed / archived |
| due_at | timestamptz NULL | |
| max_points | integer NULL | > 0 when set |
| allow_resubmit | boolean | default false |
| version | integer | ≥ 1; content edits bump |
| published_by / published_at | | Set on publish |

**Lifecycle:** `draft → published → closed → archived` (allowed back-transitions per `ASSIGNMENT_TRANSITIONS`).
**Access:** Student sees published/closed only inside active enrollment (section+program+year+semester); faculty own + active assignment (section+subject); HOD headed departments; admin institution.

## 11.2 assignment_submissions

History-preserving attempts — one row per attempt; never hard-deleted.

| Field | Type | Notes |
|---|---|---|
| assignment_id / student_id | uuid | |
| attempt_number | integer | UNIQUE(assignment_id, student_id, attempt_number) |
| status | text | draft / submitted / returned / graded |
| content_text / content_note | text | |
| score / max_points_snapshot | integer NULL | graded requires score + reviewed_at |
| feedback / reviewed_by / reviewed_at | | Faculty review foundation |

**Rules:** Student only (create/read own; peers 403). Draft updates in place; returned → new attempt. Grade: integer score ≤ assignment.max_points. Return: sets returned_at, clears score.

## 11.3 question_bank_items

| Field | Type | Notes |
|---|---|---|
| institution/department/program/subject | uuid | subject-scoped bank |
| question_type | text | mcq / short / long / numerical / true_false |
| question_text / options / answer_key / explanation | text/jsonb | options JSON array |
| marks / difficulty / unit_ref | | difficulty easy/medium/hard |
| status | text | draft / approved / retired |
| approved_by / approved_at | | approval foundation |

**Lifecycle:** `draft → approved → retired` (approved→draft, retired→draft allowed).
**Access:** Students cannot browse the bank (answer keys hidden — list FALSE, single 403). Faculty own + active subject assignment; HOD dept; admin institution.

## 11.4 question_papers + question_paper_items

| Field | Type | Notes |
|---|---|---|
| full scope chain | uuid | section_id nullable (subject-level paper) |
| paper_kind | text | assignment / quiz / mst / final / practice |
| total_marks / duration_minutes | | total_marks recomputed from items |
| status | text | draft / in_review / approved / published / archived |
| submitted_* / approved_* / published_* / approval_note | | review/approval foundation |
| version | integer | bumps on content change |

**Items:** `question_paper_items(paper_id, order_number unique, question_bank_item_id NULL, question_text_snapshot, marks)` — snapshot freezes text at add time.

**Lifecycle:** `draft → in_review → approved → published → archived`.
**Access:** Approval requires HOD/admin; publish requires approved first; student reads published papers in enrolled section (or subject-level) + section_subjects link.

## 11.5 mid_semester_tests

MST-1 and MST-2 records.

| Field | Type | Notes |
|---|---|---|
| full scope chain | uuid | section required |
| mst_number | integer | CHECK IN (1, 2) |
| title / description / scheduled_on | | scheduled_on date |
| max_marks | integer | default 40, > 0 |
| question_paper_id | uuid NULL | optional linked paper |
| status + approval/publish actors | | same lifecycle as papers |

**Constraints:** UNIQUE(section_id, subject_id, academic_year_id, mst_number).
**Lifecycle:** `draft → in_review → approved → published → archived`.
**Access:** Same as assignments for faculty/HOD/admin; student sees published only in enrolled section with subject linked.
