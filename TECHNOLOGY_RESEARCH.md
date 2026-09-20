# CampusSkill — Technology Research Report

## Status

[RESEARCH COMPLETE]

## Research Objective

Identify a practical, secure and low-cost technology architecture
for the CampusSkill MVP.

The architecture must be suitable for:

- A solo founder
- Beginner-level programming knowledge
- GitHub Codespaces development
- Android/browser-based development
- AI-assisted development
- Low or near-zero initial cost
- Future institutional scaling

---

# 1. Executive Summary

The proposed MVP architecture is:

- Frontend: Next.js + React + TypeScript
- Backend: Next.js server-side functionality
- Database: PostgreSQL through Supabase
- Authentication: Supabase Auth
- File Storage: Supabase Storage
- AI: Provider-independent AI service layer
- Initial AI provider: Gemini API, subject to final verification
- Hosting: A suitable Git-connected hosting platform
- Development: GitHub Codespaces
- Version control: GitHub
- Testing: Automated tests plus critical end-to-end testing

This architecture keeps the first version relatively simple while
retaining a path toward institutional deployment.

---

# 2. Architecture Options

## Option A — Next.js + Supabase

Components:

Next.js
→ Supabase Auth
→ PostgreSQL
→ Supabase Storage
→ AI API

Advantages:

- Relational PostgreSQL database
- Authentication integrated with database access
- Row-Level Security available
- Storage available in the same platform
- Suitable for structured academic data
- Good fit for a single full-stack application

Risks:

- Some dependency on Supabase
- Security rules must be designed correctly
- Free-tier limits must be monitored

---

## Option B — Next.js + Firebase

Components:

Next.js
→ Firebase Authentication
→ Firestore
→ Firebase Storage
→ AI API

Advantages:

- Mature authentication ecosystem
- Strong Google ecosystem integration
- Easy initial setup

Risks:

- Firestore is document-oriented rather than relational
- CampusSkill contains many relationships between users,
  institutions, subjects, skills, evidence and assessments
  - Complex relational queries can become more difficult

  ---

  ## Option C — Separate Node.js Backend + PostgreSQL

  Components:

  Next.js frontend
  → Node.js backend
  → PostgreSQL
  → Storage
  → AI API

  Advantages:

  - Clear frontend/backend separation
  - Strong long-term architectural flexibility
  - Standard PostgreSQL backend

  Risks:

  - More infrastructure
  - More configuration
  - More maintenance
  - Higher complexity for a beginner solo founder

  ---

  # 3. Proposed MVP Architecture

  The current technical direction is:

  ```text
  Student / Faculty / Admin
            ↓
                  Next.js App
                            ↓
                               Authentication Layer
                                         ↓
                                              Application API
                                                     ↙    ↓     ↘
                                                      PostgreSQL  AI   Storage
                                                        Supabase        Supabase
                                                               ↓
                                                                Skill / Evidence / Evaluation Data