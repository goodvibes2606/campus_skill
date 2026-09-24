# CAMPUSSKILL ARCHITECTURE

## Status

[APPROVED]

## Product

**Campus Skill** — product of **NxGen Digital Services**.

```text
NxGen Digital Services (parent company)
  → Campus Skill Core Platform (one reusable codebase)
    → Institution / Tenant Configuration
```

Platform-level: core architecture, auth, RBAC, authorization/security,
reusable academic modules, platform configuration, shared services,
audit/security infrastructure, product documentation.

Institution-level: identity, branding, contact, academic structure,
enabled modules, announcements, public profile, academic configuration —
via **configuration/data only** (no per-institution forks).

Branding: **Campus Skill** · **Powered by NxGen Digital Services**.
Pilot/reference tenant (A&M Institute of Management and Technology,
Pathankot) is design-partner data only — not hard-coded product identity.

## Architecture Decision

The CampusSkill MVP will use a simple full-stack web architecture.

```text
Student / Faculty / Admin
          ↓
             Next.js Application
                       ↓
                          Server/API Layer
                                    ↓
                                         Neon PostgreSQL
                                                    ↓
                                                       AI Service
                                                                 ↓
                                                                    AI Provider
```

Neon PostgreSQL — selected database provider.

---

## Authentication

Self-hosted Better Auth with Neon PostgreSQL.

```text
Better Auth (auth schema)     Application (public schema)
  ├── user                      ├── institutions
  ├── session                   ├── profiles (→ auth.user.id)
  ├── account                   ├── roles
  └── verification              └── ... (15 MVP tables)
```

- Better Auth = authentication identity + sessions
- CampusSkill profiles = application profile data
- CampusSkill roles = Student / Faculty / Admin authorization
- PostgreSQL RLS = database-level data isolation

Full details: `AUTH_ARCHITECTURE.md`

**Status: APPROVED. NOT YET IMPLEMENTED.**

---

## Multi-institution model

[CONFIRMED] — See `PRODUCT_REQUIREMENTS.md`.

- **One core product** (Campus Skill, NxGen Digital Services), shared codebase, shared security model.
- **Multiple institution tenants** with separate data, users, configuration, branding, academic structure, and module flags.
- Institution isolation and role checks are **server-side authoritative**; never trust client-provided `institution_id`, role, or academic IDs.
- Prefer **configuration over customization**; do not fork the codebase per institution.
- First institution (A&M Institute of Management and Technology, Pathankot) = pilot / design partner, not a permanent single-tenant fork and not permanent product identity.
