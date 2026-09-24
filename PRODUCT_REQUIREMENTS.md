# Campus Skill — Product Requirements

## Status

`[CONFIRMED]` — Permanent product requirements and institution-requirement model (M11 consolidation; M13 product-architecture formalization).

## Purpose

This document is the source of truth for **how Campus Skill is positioned**, **how institutions are onboarded**, and **how institution requests become implementation**. Read it before implementing any institution-specific change, configuration feature, or multi-tenant behavior.

Related documents (do not duplicate — escalate conflicts):

| Document | Role |
|---|---|
| `PROJECT_CONTEXT.md` | Master context, vision, founder / Product Owner |
| `PRODUCT_SPEC.md` | Full product specification and MVP scope |
| `DEVELOPMENT_RULES.md` | Binding development rules |
| `ARCHITECTURE.md` | Approved technical architecture |
| `AGENTS.md` | Agent operating instructions |

---

## 0. Product ownership and architecture hierarchy `[CONFIRMED]`

Campus Skill is a **product of NxGen Digital Services**.

```text
NxGen Digital Services (parent company)
  → Campus Skill Core Platform (one reusable codebase)
    → Institution / Tenant Configuration (per-institution data + settings)
```

### Platform-level concerns (Campus Skill core)

- Core application architecture  
- Authentication  
- RBAC  
- Authorization / security  
- Reusable academic modules  
- Platform configuration  
- Shared services  
- Audit / security infrastructure  
- Product documentation  

### Institution-level configuration (per tenant)

- Institution name, logo, address / contact details  
- University affiliation  
- Departments, programs/streams, academic years, semesters, sections/classes, subjects/course codes  
- Faculty, students  
- Institution branding  
- Enabled modules  
- Announcements  
- Public institution profile  
- Academic configuration  

Ordinary institution differences must be handled through **configuration/data, not source-code changes**. Decision model: **1) Existing configuration → 2) Existing module capability → 3) Reusable product feature → 4) Institution-specific controlled extension → 5) Unsupported/unsafe** (detail in §5–§7).

**Branding direction:** Campus Skill · Powered by NxGen Digital Services. Institution portals additionally display their configured institution identity. Do **not** introduce a configurable parent-attribution field and do **not** hard-code a single pilot institution as permanent product identity.

**Pilot / reference institution:** A&M Institute of Management and Technology, Pathankot — pilot/reference tenant and design partner only (may remain as pilot data); not hard-coded product identity.

**Out of scope for this architecture layer:** billing/subscriptions, payment systems, NxGen company website, replacing authentication, replacing M1–M12 architecture, unnecessary configurability.

---

## 1. Product positioning

Campus Skill is **not** only a college-specific application.

It is intended to become:

> **A configurable, multi-institution institutional education platform.**

The first institution may serve as the pilot / design partner, but the architecture must support multiple independent institutions using the same core product.

### Core principle

```text
ONE CORE PRODUCT
+ MULTIPLE INSTITUTION TENANTS
+ INSTITUTION-SPECIFIC CONFIGURATION
+ SHARED SECURITY MODEL
+ SHARED CORE CODEBASE
```

- Do **not** create a separate codebase or fork for every institution.
- Do **not** treat one pilot institution’s branding, structure, or rules as hard-coded product identity.

---

## 2. Responsive platform requirement

Campus Skill must work professionally across:

- Android phone
- Tablet / iPad
- Laptop
- Desktop

**One responsive application and shared backend.** Optimize UX by role and screen size. Do **not** create separate mobile and desktop products.

| Role | UX emphasis |
|---|---|
| Student | Mobile-first and simple |
| Faculty / TPO | Responsive operational workspace |
| HOD | Department-oriented institutional workspace |
| Director / Dean | Professional institutional portal |
| System Administrator | Technical administration workspace |

---

## 3. Configuration over customization

Permanent product principle: **CONFIGURATION OVER CUSTOMIZATION.**

When an institution requests something, first determine whether the requirement can be satisfied through **existing configuration**.

Do **not** modify source code simply because one institution has different:

- name, logo, branding
- departments, programs, subjects
- semesters, sections
- academic calendar
- enabled modules
- communication settings
- normal institutional rules

These are **institution configuration**, not core product forks.

---

## 4. Institution requirement intake

Future institution onboarding must collect **structured** information.

### 4.1 Identity

- institution name  
- short name  
- institution type  
- university / affiliation  
- established year  
- logo  
- cover image  
- address  
- city  
- state  
- country  

### 4.2 Contact

- official email  
- admission email  
- support email  
- phone  
- website  
- map / location  
- public contact information  

### 4.3 Academic

- departments  
- programs  
- streams  
- academic years  
- semesters  
- sections / classes  
- subjects  
- subject codes  
- syllabus  
- units  
- topics  

### 4.4 People

- Director / Dean  
- Institution Administrator  
- HODs  
- Faculty  
- Class Coordinators  
- TPO  
- Students  

### 4.5 Modules

- Student Management  
- Faculty Management  
- Resources  
- Syllabus  
- Assignments  
- Assessments / MST  
- Question Bank  
- Calendar  
- Notifications  
- Placement  
- AI Assistance  
- Future modules  

### 4.6 Branding

- logo  
- primary colour  
- secondary colour  
- portal identity  
- login branding  
- dashboard branding  
- favicon / public identity  

### 4.7 Communication

- official email  
- notifications  
- contact details  
- announcement preferences  

### 4.8 Institutional rules

- approval workflows  
- faculty assignment rules  
- student management rules  
- assessment rules  
- placement rules  
- notification rules  

### 4.9 Security

- roles  
- permission scope  
- institution isolation  
- department scope  
- data visibility  

### 4.10 Data import

- students  
- faculty  
- departments  
- programs  
- subjects  
- sections  

### 4.11 Custom requirements

- institution-specific feature  
- institution-specific workflow  
- institution-specific report  
- institution-specific integration  
- other requirement  

---

## 5. Requirement classification

Every future institution request must be classified as **one** of:

| Class | Meaning |
|---|---|
| **A. Configuration only** | Existing product capability satisfies it through settings / data |
| **B. Existing module** | Capability already exists but needs enabling / configuration |
| **C. Reusable product feature** | Does not exist yet but should become a standard Campus Skill feature for multiple institutions |
| **D. Institution-specific extension** | Genuinely specific to one institution; requires controlled development |
| **E. Unsupported / unsafe** | Must not be implemented without architecture / security / product review |

Do **not** automatically turn every customer request into custom code.

---

## 6. Product Owner authority

Institution administrators may **submit** requirements.

They must **not** directly modify:

- source code  
- database schema  
- platform-wide permissions  
- core product logic  
- security architecture  

The **Product Owner / platform-level authority** decides whether a request becomes:

1. configuration  
2. existing module activation  
3. reusable product feature  
4. institution-specific extension  
5. deferred / rejected requirement  

---

## 7. Requirement → implementation workflow

```text
Institution Requirement
        ↓
Requirement Intake
        ↓
Requirement Validation
        ↓
Configuration Check
        ↓
Existing Module Check
        ↓
Reusable Product Feature Check
        ↓
Institution-Specific Extension Check
        ↓
Product Owner Decision
        ↓
Implementation Brief
        ↓
Development
        ↓
Testing
        ↓
Institution Review
        ↓
Publish
```

---

## 8. Implementation brief standard

Before development of an institution-specific or new feature, create an **implementation brief** containing:

- Institution  
- Business requirement  
- User / problem  
- Current behavior  
- Desired behavior  
- Acceptance criteria  
- Security considerations  
- Data requirements  
- UI requirements  
- Affected modules  
- Configuration vs code decision  
- Priority  
- Testing requirements  

This brief becomes the source for a precise OpenCode / developer implementation prompt. Do not start coding from a vague institution request alone.

---

## 9. Multi-tenant principle

The same Campus Skill application must support:

- Institution A  
- Institution B  
- Institution C  
- Institution D  

with **separate**:

- data  
- users  
- configuration  
- branding  
- academic structures  
- enabled modules  
- institutional settings  

**Institution A must never access Institution B data.**

### Server-side authorization is authoritative

Never trust client-provided:

- `institution_id`  
- `role`  
- `department_id`  
- `student_id`  
- `faculty_id`  
- academic IDs  

Client navigation and UI filters are UX only.

---

## 10. Core product vs institution configuration

### Core product (stable)

- authentication  
- RBAC  
- academic system  
- resources  
- assignments  
- assessments  
- placement  
- AI assistance  
- notifications  
- dashboards  
- security  
- audit  

### Institution configuration (varies per tenant)

- identity  
- branding  
- contact information  
- academic structure  
- enabled modules  
- institutional settings  
- communication preferences  
- supported workflows / rules  

The core product should remain stable while institution configuration varies.

---

## 11. Pilot → product → customer model

```text
Pilot Institution
        ↓
Real User Feedback
        ↓
Product Improvements
        ↓
Reusable Platform Features
        ↓
Repeatable Institution Onboarding
        ↓
Additional Institutions
```

The first institution is a **pilot / design partner**, not a separate software fork.

---

## 12. Product management principle

Future development decisions must ask:

> “If another institution needs this tomorrow, can we configure it rather than rewrite it?”

- **If yes** → prefer configuration.  
- **If no** → determine whether it should become a **reusable** product capability.  
- **Only** genuinely institution-specific requirements become controlled extensions.  
- Avoid excessive configurability that makes the product difficult to maintain.

---

## 13. Relationship to M11 implementation

M11 already implements the **foundation** of this model (not a redesign target):

- `institution_configs`, `institution_modules`, `institution_config_changes`, `institution_config_audit`  
- Institution Control Center (`/institution/*`)  
- Public directory (`/public`, `/public/institution/[slug]`)  
- Server-side institution workspace authorization  

This document records the **permanent product strategy** those tables and pages support. Future work extends intake, classification workflow, and briefs — it does not fork the codebase per institution.

---

## 14. Milestones M1–M12 — current capabilities `[CONFIRMED]`

Implemented and checkpointed through M12 (`0143317` — Checkpoint: complete milestone 12). Do not rebuild; extend only with Product Owner approval.

### Platform-level (shared core)

- Application foundation: Next.js + React + TypeScript; Neon PostgreSQL; Better Auth  
- RBAC / roles / server-side authorization; institution-scoped workspace isolation  
- Academic modules (structure, resources, syllabus, assignments, assessments, question bank, calendar, daily work, placement foundation, AI assistance surface, notifications)  
- Institution Control Center + config audit + sensitive-area change workflow  
- Account lifecycle, password reset / email verification foundation  
- Import/export engines, file object registry + local_fs blob store  
- Privacy/consent, announcements, Help KB  
- Two-institution E2E seed + live isolation verification  
- Docs: product requirements, architecture, operations backup/monitoring  

### Institution-level (configuration, not forks)

- Identity/contact/branding/public profile in `institution_configs`  
- Enabled modules (`institution_modules`)  
- Academic structure + people per tenant  
- Privacy notices, announcements, onboarding checklist  
- Public directory `/public`, `/public/institution/[slug]`  

### M12 backlog items (as completed)

- Account lifecycle: `pending` / `active` / `suspended` / `inactive` / `graduated` / `left` (+ `deactivated` technical) — workspace access fail-closed on non-active.
- Password reset + email verification foundation (Better Auth; optional server webhook delivery — no client-exposed links).
- File object registry (`file_objects`) + local filesystem blob store (`.file-store/`, provider `local_fs`).
- CSV/Excel (native XLSX) import pipeline (parse → validate → preview → approve → run; structure-safe entities; audit).
- Controlled export jobs (role-gated; TPO blocked from enrollment/assignment exports).
- Privacy / consent: notice wording configurable per institution; consent acceptance recorded with hashed IP.
- Announcements: audience-scoped, publish workflow, notification fan-out.
- Campus Skill Help: static role+module knowledge base (`/help` + `/api/help`) — no AI key required.
- Two-institution E2E seed (`scripts/seed-e2e.mjs`) for isolation testing.
- Thesis Mentor UI/nav removed (deferred product surface).
- Responsive UX polish + loading states for high-traffic pages.
- Backup & monitoring requirements documented in `OPERATIONS_BACKUP_MONITORING.md`.

## 15. Future backlog — not in M1–M12 `[CONFIRMED]`

Deferred until explicitly approved (development sequence / `PRODUCT_SPEC.md` / `AGENTS.md` rules):

- Attendance, Timetable, Examination — **future modules only** (separate Product Owner approval required; not started by M13).
- Production blob storage provider + CDN (beyond local_fs foundation).
- Real SMTP / transactional email provider (optional webhook + console fallback today).
- Row-Level Security hardening beyond application-level isolation (architecture already anticipates RLS).
- Full Excel engine scale, large-scale spreadsheet, SSO/SAML, multi-campus, billing, advanced analytics.
- Recruiter marketplace, payments, Android application, advanced portfolio, job matching, internship management, complex multi-agent AI, large-scale multilingual content.
- Configurable parent-company attribution **field** — intentionally **not** introduced (branding direction is fixed product copy: “Powered by NxGen Digital Services”).
- Wiring `assertModuleEnabled` into every feature route — only if a later security/configuration defect requires it; not part of documentation-only M13.
- M14+ feature milestones — do not start without Product Owner approval.

---

## 16. Labels for unresolved items

Use existing labels from `AGENTS.md` / `DEVELOPMENT_RULES.md`:

- `[CONFIRMED]` — confirmed product requirement  
- `[ASSUMPTION]` — temporary assumption  
- `[NEEDS DECISION]` — requires Product Owner approval  
- `[TECHNICAL RECOMMENDATION]` — technical recommendation from development agent  
