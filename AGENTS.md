# AGENTS.md

## Source of truth

These documents are the project's source of truth. Read them before making any significant change:

1. `PROJECT_CONTEXT.md` — master context, product vision, current phase, founder role
2. `DEVELOPMENT_RULES.md` — 28 binding rules for all work
3. `PRODUCT_SPEC.md` — full product specification, MVP scope, user journeys
4. `PRODUCT_REQUIREMENTS.md` — multi-institution positioning, configuration-over-customization, requirement intake/classification/workflow, Product Owner authority
5. `TECHNOLOGY_RESEARCH.md` — technology research report with rationale
6. `ARCHITECTURE.md` — approved architecture decision

If any document conflicts, escalate. Do not silently resolve conflicts.

**Before implementing any institution-specific change, configuration feature, or multi-tenant behavior, read `PRODUCT_REQUIREMENTS.md`.**

## Current status

**PHASE 0 — Development Environment** remains the approved baseline for launching new work. Documentation is approved. Application milestones M1–M12 are **checkpointed** (latest `0143317` — Checkpoint: complete milestone 12; see `CHANGELOG.md`).

**M13 — Product Architecture Documentation Formalization** is in progress and is **documentation-only** (formalize NxGen Digital Services → Campus Skill Core Platform → Institution/Tenant Configuration). Do not start feature milestones (M14+, Attendance/Timetable/Examination, billing, etc.) without Product Owner approval.

**Product ownership:** Campus Skill is a product of **NxGen Digital Services**. Branding direction: Campus Skill · Powered by NxGen Digital Services. Pilot/reference institution (A&M Institute of Management and Technology, Pathankot) is tenant data only — not hard-coded product identity. See `PRODUCT_REQUIREMENTS.md` §0.

## Approved architecture

- Parent company / product: NxGen Digital Services → Campus Skill Core Platform → Institution/Tenant Configuration
- Frontend: Next.js + React + TypeScript
- Backend: Next.js server-side / API routes
- Database: Neon PostgreSQL (with Row-Level Security)
- Auth: Better Auth (implemented; not to be replaced without approval)
- Storage: local filesystem foundation (`.file-store/`); cloud provider TBD
- AI: Provider-independent abstraction layer (initial provider: Gemini, subject to final verification)
- Hosting: TBD

## Rules for agents

### 1. Source of truth

Always read the documents above before starting work — including `PRODUCT_REQUIREMENTS.md` for institution / multi-tenant / configuration decisions. Do not assume context from file names or prior sessions.

### 2. No silent requirement changes

Never change confirmed product requirements without explicit Product Owner approval. If a change seems necessary, document it as `[NEEDS DECISION]` and ask.

### 3. No silent architecture changes

Never modify the approved architecture without approval. Document proposed changes as `[TECHNICAL RECOMMENDATION]` with rationale.

### 4. Small, reversible steps

Make the smallest change needed. Do not touch unrelated files. Prefer changes that can be reverted cleanly.

### 5. Inspect before modifying

Read existing code and config before changing it. Understand current behavior and dependencies first.

### 6. No secrets in code or commits

Never expose API keys, tokens, database credentials, or other secrets in frontend code or committed files. Use environment variables or secure secret management. Check `.gitignore` before committing.

### 7. Security and authorization

Protected functionality must verify authentication and check authorization. Students must not access other students' data. Faculty and admin access must follow explicit permissions.

### 8. Test before claiming

Never claim a feature works without testing it. Run relevant tests, verify the main user flow, and check for regressions.

### 9. Update CHANGELOG.md

Record meaningful implementation milestones in `CHANGELOG.md`. A milestone is a completed feature, fix, or phase — not every commit.

### 10. Identify assumptions and decisions

Use these labels in documentation:

- `[CONFIRMED]` — confirmed product requirement
- `[ASSUMPTION]` — temporary assumption, not confirmed
- `[NEEDS DECISION]` — requires Product Owner approval
- `[TECHNICAL RECOMMENDATION]` — technical recommendation from development agent

Do not present assumptions as facts.

### 11. No premature features

Do not build future-phase features unless explicitly approved. The deferred list includes: recruiter marketplace, payments, Android app, advanced portfolio, job matching, internship management, complex multi-agent AI, large-scale multilingual content.

Follow the approved development sequence — do not skip ahead.

### 12. Ask when ambiguous

When a requirement is genuinely ambiguous, ask for clarification. Do not silently invent an important product decision.

## Development sequence

1. Product specification ✅
2. Research ✅
3. Technical architecture ✅
4. **Project foundation** ← NEXT
5. Authentication
6. Student MVP
7. AI evaluation
8. Skill Passport
9. Faculty MVP
10. Testing
11. Pilot
12. Business validation
13. Institutional version
14. Internship module
15. Recruiter module
16. Android application

## Founder / Product Owner

The founder is a solo founder with limited programming experience. They are the Product Owner and academic subject-matter expert. Technical decisions must be explained in simple language when they require approval. AI agents assist with research, architecture, code, testing, and docs — but must never silently change confirmed requirements.

## Git conventions

Meaningful commits only. No vague messages like "update" or "fix stuff". Prefer: "Add student authentication", "Create case study model", etc.

## Key docs

| File | Purpose |
|---|---|
| `PROJECT_CONTEXT.md` | Master project context — read first |
| `PRODUCT_SPEC.md` | Full product specification |
| `PRODUCT_REQUIREMENTS.md` | Multi-institution product requirements & requirement workflow |
| `ARCHITECTURE.md` | Approved architecture decision |
| `TECHNOLOGY_RESEARCH.md` | Tech research report with rationale |
| `DEVELOPMENT_RULES.md` | 28 rules governing all work |
| `RESEARCH_PROTOCOL.md` | How research must be conducted |
| `RESEARCH_TASK.md` | The research task that was completed |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
