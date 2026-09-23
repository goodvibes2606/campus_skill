# CampusSkill — Project Context

## Project Name

CampusSkill

## GitHub Repository

campus_skill

## Product Type

AI-powered academic-to-career platform for college students.

Multi-institution institutional education platform: one core product,
multiple institution tenants, institution-specific configuration.
Permanent requirements: see `PRODUCT_REQUIREMENTS.md`.

## Product Vision

CampusSkill helps college students convert academic learning into
practical skills, demonstrable evidence, and career readiness.

The core learning loop is:

Learn → Practice → Apply → Get Evaluated → Improve → Build Evidence → Become Career Ready

## Initial Market

The initial pilot will be conducted within the founder's college environment.

The pilot institution is a design partner — not a separate software fork.
Architecture and configuration model: `PRODUCT_REQUIREMENTS.md`
(multi-institution, configuration over customization).

Future expansion will target PTU-affiliated colleges and eventually
other higher-education institutions in India.

## Target Users

All college students.

Initial development should focus on a small representative group
of undergraduate students before expanding to all disciplines.

## User Roles

MVP:

1. Student
2. Faculty
3. Admin

Future:

4. Recruiter

## Languages

Required:

1. English
2. Hindi
3. Punjabi

The architecture must support internationalization so additional
Indian languages can be added later.

## Core Product Engines

### 1. Skill Passport

A student's evolving profile of demonstrated skills and evidence.

### 2. Study-to-Job Simulator

Real-world academic and workplace cases where students apply
academic knowledge to practical situations.

### 3. Internship Evidence Builder

Future module that records internship activities, problems,
solutions, skills and evidence.

## MVP

The first prototype must remain small.

MVP student functionality:

- Authentication
- Student profile
- Dashboard
- Subject selection
- Case studies
- Case simulation
- Answer submission
- AI-assisted evaluation
- Feedback
- Skill score
- Skill Passport
- Activity history

MVP faculty functionality:

- Authentication
- Faculty dashboard
- Student list
- Student performance
- Skill analytics
- Faculty feedback

MVP admin functionality:

- Authentication
- Institution dashboard
- Student management
- Faculty management
- Subject management
- Basic usage analytics

## Deferred Features

Do not implement these during the first prototype unless explicitly
approved:

- Recruiter marketplace
- Advanced recruiter portal
- Full internship management
- Advanced portfolio
- Job matching
- Payment system
- Android application
- Advanced institutional analytics
- Complex multi-agent AI system
- Large-scale multilingual content system

## AI Philosophy

AI is an assistant, coach and evaluator.

AI must not automatically represent an unverified student competency
as an officially verified achievement.

Where formal verification is required, faculty or authorized
institutional personnel should verify the evidence.

## AI Provider Architecture

The application should not be permanently dependent on a single
AI provider.

Use an AI service abstraction/gateway so that different AI
providers can be added or replaced later.

Potential providers include:

- Gemini
- OpenAI
- Other compatible providers

API keys must never be exposed in frontend code.

Secrets must be stored using environment variables or secure
secret management.

## Initial Academic Domains

Initial prototype content may focus on subjects that are relevant
to the founder's teaching expertise, such as:

- Marketing Management
- Human Resource Management
- Principles and Practices of Management
- Business Organization and Management

Additional disciplines will be added after the prototype is validated.

## Business Model

Long-term model:

B2B/B2B2C institutional SaaS.

Possible pricing model:

Per-student institutional licensing.

An initial target price may be around ₹500/student/year, but this
is NOT a confirmed final price.

Final pricing must be based on:

- actual AI usage
- infrastructure cost
- student usage
- institutional value
- support cost
- maintenance cost
- taxes and business expenses

The first objective is validation, not maximizing revenue.

## Development Philosophy

Build the smallest useful working prototype first.

Do not build the complete commercial platform before validating
the core product.

Development sequence:

1. Product specification
2. Research
3. Technical architecture
4. Project foundation
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

## Founder Role

The founder is the Product Owner and academic subject-matter expert.

The founder may not have professional programming knowledge.

AI agents are expected to assist with:

- research
- product architecture
- UI/UX
- programming
- database design
- API development
- debugging
- testing
- documentation
- technical explanations

Technical decisions must be explained in understandable language
when they require founder approval.

## AI Agent Behavior

Before making significant changes:

1. Read PROJECT_CONTEXT.md.
2. Read relevant project documentation.
3. Inspect existing code.
4. Identify dependencies.
5. Explain important assumptions.
6. Make the smallest appropriate change.
7. Test the change.
8. Check for regressions.
9. Update relevant documentation.
10. Commit meaningful completed work.

## Requirement Labels

Use these labels in project documentation:

[CONFIRMED]
Confirmed product requirement.

[ASSUMPTION]
Temporary assumption that has not been confirmed.

[NEEDS DECISION]
Requires founder/product-owner decision.

[TECHNICAL RECOMMENDATION]
Technical recommendation from the development agent.

## Institution requirements

Structured institution intake, requirement classification (configuration /
existing module / reusable feature / institution-specific extension /
unsupported), Product Owner decision authority, and implementation briefs
are defined in `PRODUCT_REQUIREMENTS.md`. Read that document before
changing institution-specific behavior.

## Current Project Phase

PHASE 0 — Development Environment

## Current Task

Establish project documentation and development rules before
application implementation begins.

## Important Rule

Do not start building the application until the product,
architecture and development rules have been reviewed.

## Current Status

GitHub repository created.

GitHub Codespace created.

Project implementation has NOT started.