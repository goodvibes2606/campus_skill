# CampusSkill — Authentication Architecture

## Status

[APPROVED]

## Implementation Status

**NOT IMPLEMENTED.** This document records an approved architectural decision.
No authentication code, packages, or database tables exist yet.

---

# 1. Decision Summary

CampusSkill will use **self-hosted Better Auth** with **Neon PostgreSQL** for
authentication. Better Auth handles identity, sessions, and login/logout.
CampusSkill's application tables handle profiles, roles, and authorization.

---

# 2. Authentication Flow

```
1. User
   → /api/auth/sign-in/email
   → Better Auth validates credentials
   → secure session cookie is set

2. User
   → protected page
   → Next.js proxy.ts checks the session

3. Server Component / Server-side code
   → auth.api.getSession(headers)
   → obtains authenticated user.id

4. Protected database operation
   → BEGIN
   → set_config('app.current_user_id', user.id, true)
   → execute database query
   → COMMIT

5. PostgreSQL RLS
   → current_setting('app.current_user_id', true)::uuid
   → enforce user's institution and role boundaries
```

---

# 3. Architectural Boundary

| Layer | Responsibility | Technology |
|---|---|---|
| Authentication identity | Who is the user | Better Auth (`auth` schema) |
| Session management | Login state, cookies | Better Auth |
| Application profile | Student/Faculty/Admin data | `public.profiles` table |
| Authorization | Role-based access | Application logic + RLS |
| Database isolation | Multi-tenant data safety | PostgreSQL RLS |
| Database provider | Hosting | Neon PostgreSQL |

Better Auth and CampusSkill application tables are independent layers
linked by user ID.

---

# 4. Database Schema Boundary

## 4.1 Two Schemas

```text
Neon PostgreSQL
  ├── auth schema        (Better Auth managed)
  │     ├── user
  │     ├── session
  │     ├── account
  │     └── verification
  │
  └── public schema      (Application managed)
        ├── institutions
        ├── profiles
        ├── roles
        ├── departments
        ├── courses
        ├── subjects
        ├── student_subjects
        ├── case_studies
        ├── assessments
        ├── student_answers
        ├── evaluations
        ├── skills
        ├── skill_evidence
        ├── faculty_feedback
        └── activity_logs
```

## 4.2 Schema Ownership

- **`auth` schema**: Managed by Better Auth CLI (`npx auth@latest migrate`).
  Application code never writes SQL migrations for this schema.

- **`public` schema**: Managed by application SQL migrations.
  Better Auth CLI never touches this schema.

## 4.3 RLS on Auth Schema

[CONFIRMED] — Better Auth's `auth` schema is NOT protected by RLS.
Better Auth manages its own access control at the application layer
(session cookies, API endpoint protection). RLS is for application
data isolation only.

---

# 5. User ID and Profile Relationship

## 5.1 Identity Chain

```text
auth.user.id (UUID)
  ↓ 1:1 FK
public.profiles.id (UUID)
  ├── profiles.role         ('student', 'faculty', 'admin')
  └── profiles.institution_id (FK → institutions)
```

## 5.2 User ID Format

[CONFIRMED] — Better Auth generates UUIDs for all tables.
Application `profiles.id` is `uuid (PK)` referencing `auth.user.id`.

## 5.3 Profile Creation

When a user signs up via Better Auth, an `after` database hook
auto-creates a corresponding row in `public.profiles`.

[ASSUMPTION] — The hook will set default role to 'student' and
require institution_id to be provided during signup or set by admin.

---

# 6. Student / Faculty / Admin Authorization Model

## 6.1 Roles

Roles are application-level concepts stored in `public.profiles.role`.
They are NOT stored in Better Auth's auth tables.

```text
profiles.role values:
  - 'student'   → Can read/write own data, read enrolled subjects
  - 'faculty'   → Can read/write in their institution, verify evaluations
  - 'admin'     → Full CRUD within their institution
```

## 6.2 Role Assignment

[NEEDS DECISION] — How roles are assigned:
- Students self-register and are assigned 'student' by default
- Faculty accounts are created by institution admin
- Admin accounts are created during institution setup

## 6.3 Authorization Enforcement

Authorization is enforced at two levels:
1. **Application logic**: Route protection, API endpoint checks
2. **PostgreSQL RLS**: Database-level data isolation

---

# 7. Institution Isolation

## 7.1 Multi-Tenant Principle

Every data table in `public` schema includes `institution_id`.
Users can only access rows belonging to their institution.

## 7.2 Isolation Enforcement

```text
User authenticates → profiles.institution_id determined
  → RLS policies filter queries by institution_id
  → User never sees data from other institutions
```

---

# 8. Transaction-Local Identity Propagation

## 8.1 Security Requirement

The authenticated user ID MUST be transaction-local.
Never use a persistent PostgreSQL session setting for user identity.

## 8.2 Why Transaction-Scoped

Neon uses PgBouncer in transaction mode. Session-level PostgreSQL
settings do not reliably persist between transactions. Only
transaction-scoped settings are safe.

## 8.3 Mechanism

```sql
SELECT set_config('app.current_user_id', '<user-uuid>', true);
```

The third parameter (`is_local = true`) makes the setting
transaction-scoped. When the transaction ends (commit or rollback),
the setting is automatically cleared.

## 8.4 Why This Prevents Identity Leakage

1. `set_config(..., true)` is transaction-scoped (PostgreSQL confirmed)
2. PgBouncer in transaction mode resets session state between transactions
3. The setting exists only within the active transaction
4. No other request on the same physical connection can see this setting

## 8.5 Application Pattern

```ts
async function queryWithAuth(userId: string, fn: (client) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true)",
      [userId]
    );
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
```

---

# 9. RLS Strategy

## 9.1 RLS User ID Reference

RLS policies use `current_setting('app.current_user_id', true)::uuid`
to determine the current user. The `true` parameter means "return NULL
if setting is not set" rather than raising an error.

## 9.2 Policy Patterns

### Pattern A — Student owns row

```sql
CREATE POLICY student_own_rows ON table_name
  FOR ALL
  USING (student_id = current_setting('app.current_user_id', true)::uuid);
```

### Pattern B — Same institution

```sql
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

---

# 10. Session Architecture

## 10.1 Session Storage

[CONFIRMED] — Database-backed sessions stored in `auth.session` table.
Optional cookie cache for performance (avoids DB hit on every request).

## 10.2 Session Configuration

```ts
session: {
  expiresIn: 60 * 60 * 24 * 7,  // 7 days
  updateAge: 60 * 60 * 24,       // Refresh daily
  cookieCache: {
    enabled: true,
    maxAge: 5 * 60,              // 5-minute cache
    strategy: "compact",
  },
}
```

## 10.3 Session Validation

- **Next.js 16 proxy.ts**: Check session cookie for route protection
- **Server Components**: `auth.api.getSession({ headers })`
- **API Routes**: `auth.api.getSession({ headers })`

---

# 11. Security Requirements

| Requirement | Implementation |
|---|---|
| Password storage | Better Auth uses bcrypt/argon2 |
| Session cookies | HTTP-only, Secure, SameSite |
| CSRF protection | Better Auth internal |
| SQL injection | Parameterized queries |
| Identity leakage | Transaction-scoped set_config |
| Multi-tenant isolation | RLS + institution_id |
| Role escalation | Roles in application layer, not user-modifiable |
| RLS bypass | Enforced at database level |

---

# 12. Future Compatibility

## 12.1 B2B / Institutional SaaS

- Multi-tenant via institution_id on all data tables
- Better Auth organizations plugin available for formal institution management
- Institution-specific OAuth providers possible via Better Auth configuration

## 12.2 Social Login

Better Auth supports Google, GitHub, and other OAuth providers via plugins.
Add when ready — no architecture changes required.

## 12.3 MFA

Better Auth supports MFA via plugins.
Add when ready — no architecture changes required.

---

# 13. Implementation Sequence

When implementation is approved:

1. ~~Install: `better-auth`, `pg`~~ ✅ Done (Milestone 1)
2. ~~Create `src/lib/auth.ts` — Better Auth config with `schemaName: "auth"`~~ ✅ Done (Milestone 1)
3. ~~Create `src/lib/db.ts` — PostgreSQL pool with `queryWithAuth` helper~~ ✅ Done (Milestone 1)
4. Create `src/app/api/auth/[...all]/route.ts` — Better Auth handlers
5. Apply `migrations/000_create_better_auth_schema.sql` — Create `auth` schema tables
6. Create application migration: `public.profiles` (FK → auth.user.id)
7. Add `after` hook: user signup → auto-create profile row
8. Create `proxy.ts` — Session check for protected routes
9. Test: sign up, sign in, session, profile creation
10. Create application migration: remaining MVP tables
11. Implement RLS policies using `current_setting('app.current_user_id', true)::uuid`
12. Test: RLS enforcement, role-based access, multi-tenant isolation

---

# 14. Completed Architecture Decisions

The following documentation corrections have been completed and are
now reflected in DATABASE_SPEC.md.

## 14.1 auth.uid() References — RESOLVED

DATABASE_SPEC.md §4.2 and §4.3 previously used `auth.uid()`, a
Supabase-specific PostgreSQL function. All instances have been
replaced with `current_setting('app.current_user_id', true)::uuid`.

Resolved locations:
- §4.2 `get_user_profile()` function definition
- §4.3 Pattern A — student_own_rows policy
- §4.3 Pattern B — institution_read policy
- §4.3 Pattern C — faculty_institution policy
- §4.3 Pattern D — admin_institution policy

## 14.2 get_user_profile() Function — RESOLVED

DATABASE_SPEC.md §4.2 previously defined `get_user_profile()` using
`auth.uid()`. The function body now uses
`current_setting('app.current_user_id', true)::uuid`.

## 14.3 profiles.id Reference — RESOLVED

DATABASE_SPEC.md §2.2 previously stated profiles.id "References
auth.users.id" (Supabase convention). It now correctly states
"References auth.user.id" (Better Auth convention).

---

# 15. Packages

| Package | Purpose | Status |
|---|---|---|
| `better-auth` | Authentication library | Installed (1.7.5) |
| `pg` | PostgreSQL driver | Installed (^8.23.0) |
| `@types/pg` | TypeScript types for pg | Installed (^8.23.1) |

---

# 16. Environment Variables

Documented in `.env.local.example`. Not configured with real values
until Neon database is provisioned.

```env
DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
BETTER_AUTH_SECRET=<generate-random-32-char-secret>
BETTER_AUTH_URL=http://localhost:3000
```

---

# 17. Files Created / Not Yet Created

## Created (Milestone 1)

| File | Purpose | Status |
|---|---|---|
| `src/lib/auth.ts` | Better Auth configuration | Created |
| `src/lib/db.ts` | PostgreSQL connection pool | Created |
| `.env.local.example` | Environment variable template | Created |

## Not Yet Created

| File | Purpose |
|---|---|
| `src/lib/auth-client.ts` | Better Auth client (browser) |
| `src/app/api/auth/[...all]/route.ts` | Better Auth API handlers |
| `proxy.ts` | Next.js 16 session protection |
