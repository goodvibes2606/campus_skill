# CampusSkill — Technology Research Task

## Status

[CONFIRMED]

Research must be completed before final technology architecture is
approved.

---

# Research Objective

Determine the most practical technical architecture for the
CampusSkill MVP.

CampusSkill is being developed by a solo founder who has limited
professional programming experience and intends to use AI-assisted
development.

The initial prototype should have very low development cost while
remaining secure, maintainable and capable of scaling if the pilot
succeeds.

---

# Project Context

Read these files before starting:

1. PROJECT_CONTEXT.md
2. DEVELOPMENT_RULES.md
3. PRODUCT_SPEC.md
4. RESEARCH_PROTOCOL.md

These files define the approved product requirements and research rules.

Do not modify them while conducting this research.

---

# Primary Research Questions

## 1. Frontend

Determine suitable frontend options for CampusSkill.

Evaluate:

- React
- Next.js
- Other practical alternatives if relevant

Consider:

- Beginner-friendliness
- AI-assisted development
- Responsive design
- Mobile browser support
- Component ecosystem
- Authentication integration
- Deployment
- Long-term maintainability

---

# 2. Backend

Determine suitable backend approaches.

Evaluate realistic options such as:

- Next.js backend/API routes
- Node.js backend
- Other suitable managed backend approaches

Consider:

- Development complexity
- Authentication
- Database integration
- API development
- Security
- Deployment
- Scalability
- Cost

---

# 3. Database

Evaluate suitable databases.

Consider options such as:

- PostgreSQL
- Supabase
- Firebase
- Other appropriate managed databases

Compare:

- Relational data support
- Authentication integration
- Security
- Scalability
- Cost
- Ease of development
- AI-assisted development
- Backup
- Migration difficulty

CampusSkill will eventually contain relationships among:

- Institutions
- Users
- Students
- Faculty
- Subjects
- Skills
- Case Studies
- Activities
- Evaluations
- Evidence
- Verification

The database must therefore support structured relational data.

---

# 4. Authentication

Research practical authentication solutions.

Consider:

- Supabase Auth
- Firebase Authentication
- Auth.js / NextAuth
- Other suitable options

Evaluate:

- Email/password authentication
- Role-based access
- Security
- Ease of integration
- Cost
- Student usability
- Faculty usability
- Admin usability

---

# 5. AI Integration

Research practical AI API options for the CampusSkill MVP.

Consider:

- Gemini
- OpenAI
- Other suitable providers

Evaluate:

- Model capability
- Structured JSON output
- API availability
- Current pricing
- Prototype cost
- Rate limits
- Context limits
- Reliability
- Integration complexity
- Provider lock-in

Use current official pricing and documentation when making
cost-related claims.

Do not assume that a free tier will remain free.

---

# 6. AI Evaluation Architecture

Research how CampusSkill should implement:

Student Answer
↓
Evaluation Request
↓
Approved Rubric
↓
AI Model
↓
Structured Evaluation
↓
Validation
↓
Database
↓
Student Feedback

Investigate:

- Structured output
- JSON schema validation
- Prompt versioning
- Rubric versioning
- Evaluation reproducibility
- Error handling
- AI hallucination mitigation
- Human/faculty verification
- Cost control

---

# 7. Hosting

Research suitable hosting options for the MVP.

Consider:

- Vercel
- Cloudflare
- Netlify
- Other practical alternatives

Evaluate:

- Free/low-cost prototype availability
- Deployment simplicity
- GitHub integration
- Environment variables
- Database connectivity
- Server-side API support
- Scaling
- Vendor lock-in

---

# 8. File Storage

CampusSkill will eventually need to store evidence and possibly
documents.

Research suitable options for:

- Student evidence
- Project files
- Internship evidence
- Documents
- Images

Consider:

- Supabase Storage
- Firebase Storage
- Cloud object storage
- Other appropriate solutions

Do not implement file storage yet.

---

# 9. Security

Identify the minimum security architecture required for the MVP.

Research:

- Authentication
- Authorization
- Role-based access
- Database access policies
- API security
- Secret management
- Input validation
- Rate limiting
- Student data protection
- AI API key protection

Pay particular attention to preventing one student from accessing
another student's private information.

---

# 10. Testing

Research a practical testing strategy for a solo developer.

Consider:

- Unit tests
- Integration tests
- End-to-end tests
- API tests
- Authentication tests
- Role/permission tests
- AI evaluation tests

The testing strategy must remain practical for a small MVP.

---

# 11. Development Environment

The founder is currently developing through:

- GitHub
- GitHub Codespaces
- Browser
- Android device

The research should determine whether this workflow is practical for
the MVP.

Do not assume the founder has a powerful local development machine.

---

# 12. Cost Analysis

Estimate the major prototype cost categories.

Consider:

- GitHub/Codespaces
- Hosting
- Database
- AI API
- File storage
- Email
- Domain
- Monitoring
- Other essential services

Separate:

Prototype cost

from

Potential production cost.

Use current official pricing wherever possible.

Do not present speculative costs as confirmed prices.

---

# 13. Architecture Alternatives

Produce at least three realistic architecture approaches.

For example:

### Option A

Single full-stack web application with managed database/authentication
and external AI API.

### Option B

Next.js application with managed PostgreSQL/authentication and an
AI service abstraction.

### Option C

Another realistic architecture identified during research.

Do not create artificial alternatives merely to increase the number of
options.

---

# 14. Comparison Criteria

Compare realistic options using:

- Development complexity
- Beginner-friendliness
- AI-agent compatibility
- Security
- Prototype cost
- Scalability
- Maintainability
- Mobile responsiveness
- Database suitability
- Authentication
- AI integration
- Vendor lock-in
- Migration difficulty

Do not assign arbitrary scores unless there is a defensible,
documented methodology.

---

# 15. Required Research Output

Create a document:

```text
TECHNOLOGY_RESEARCH.md