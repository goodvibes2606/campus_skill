# CAMPUSSKILL ARCHITECTURE

## Status

[APPROVED]

## Product

CampusSkill

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
