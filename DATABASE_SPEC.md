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
- Supabase conventions: use `auth.uid()` for current user, pgcrypto for
  UUID generation

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

**Purpose:** Extends Supabase auth.users with role and institutional
affiliation. One profile per user.

**Phase:** MVP

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | References auth.users.id |
| institution_id | uuid (FK → institutions) | |
| role | text | 'student', 'faculty', 'admin' |
| full_name | text | |
| email | text | Denormalized from auth.users for queries |
| avatar_url | text | Nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Relationships:** Belongs to institution. Links auth user to role.

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

## 4.2 Helper Function

A Supabase PostgreSQL function `get_user_profile()` returns the
current user's profile row (role + institution_id). RLS policies
call this function to determine access.

```sql
-- Pseudocode, not implementation
CREATE FUNCTION get_user_profile()
RETURNS profiles
-- Returns the profile row for auth.uid()
```

## 4.3 Policy Patterns

### Pattern A — Student owns row

```sql
-- Student can read/write their own rows
CREATE POLICY student_own_rows ON table_name
  FOR ALL
  USING (student_id = auth.uid());
```

### Pattern B — Same institution

```sql
-- User can read rows in their institution
CREATE POLICY institution_read ON table_name
  FOR SELECT
  USING (
    institution_id = (
      SELECT institution_id FROM profiles WHERE id = auth.uid()
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
      WHERE id = auth.uid() AND role = 'faculty'
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
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

## 4.4 Table-Level RLS Summary

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

## 4.5 Denormalization for RLS

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
