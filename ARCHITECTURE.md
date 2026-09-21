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
