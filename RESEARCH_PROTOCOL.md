# CampusSkill — Research Protocol

## Purpose

This document defines how research must be performed before major
product, technical, AI, business or architecture decisions are made.

Research must support decisions.

Research must not be used as an excuse to continuously delay
development.

---

# 1. Research Principles

Research must be:

- Relevant to CampusSkill
- Evidence-based
- Current when current information matters
- Clearly documented
- Separated from personal opinion
- Separated from assumptions
- Connected to a specific product or technical decision

Do not research topics merely because they are interesting.

---

# 2. Research Categories

Research may be required in the following areas:

## Product Research

Study:

- Student problems
- Faculty workflows
- Institutional requirements
- Academic-to-career platforms
- Skill development platforms
- Evidence-based learning
- Experiential learning

---

## Technical Research

Study:

- Frontend technologies
- Backend technologies
- Databases
- Authentication
- Hosting
- APIs
- AI integration
- File storage
- Security
- Testing
- Deployment
- Mobile responsiveness

---

## AI Research

Study:

- AI model capabilities
- Structured AI output
- AI evaluation
- Rubric-based scoring
- Prompt engineering
- AI cost
- Provider availability
- AI reliability
- Hallucination reduction
- Human verification

---

## Business Research

Study:

- Institutional SaaS
- College technology purchasing
- Per-student pricing
- Pilot models
- Student adoption
- Institutional adoption
- Support requirements
- Unit economics

---

## Competitive Research

Study relevant products and platforms.

For each relevant competitor, record:

- Product name
- Target users
- Main features
- Business model
- Strengths
- Limitations
- Relevant ideas for CampusSkill
- Features CampusSkill should avoid copying unnecessarily

Do not copy another product simply because it has a feature.

---

# 3. Research Questions

Before technical architecture is finalized, research should answer:

1. What is the smallest technically reliable stack for CampusSkill?
2. Which technologies can be used at very low cost during the prototype?
3. Which technologies can scale if the pilot succeeds?
4. What database architecture is appropriate?
5. What authentication approach is appropriate?
6. How should AI providers be integrated?
7. How should AI evaluation results be structured?
8. How should student evidence be stored?
9. How should faculty verification work?
10. How should student privacy be protected?
11. How can the system remain responsive on mobile devices?
12. What are the expected infrastructure costs?
13. What are the major technical risks?
14. What are the major product risks?
15. What can be postponed until after the MVP?

---

# 4. Research Source Priority

Prefer sources in approximately this order:

1. Official documentation
2. Government or institutional sources
3. Official technical documentation
4. Academic research
5. Established industry research
6. Reputable technical publications
7. Community discussions

Community discussions may provide useful practical experience but
should not automatically be treated as authoritative facts.

---

# 5. Technology Research Rules

When evaluating a technology, investigate:

- Current availability
- Documentation quality
- Cost
- Free/low-cost prototype availability
- Learning difficulty
- Security
- Scalability
- Integration options
- Community support
- Migration difficulty
- Vendor lock-in
- Suitability for a solo founder using AI-assisted development

Do not select technology simply because it is popular.

---

# 6. AI Provider Research

AI providers should be compared using:

- Model capability
- Structured output support
- API availability
- Current pricing
- Prototype cost
- Rate limits
- Context limits
- Reliability
- Indian user accessibility
- Integration difficulty
- Provider lock-in

Current pricing must always be checked from official sources before
being used in financial calculations.

---

# 7. Research Output Format

Every major research task should produce a structured report.

Use:

## Research Question

What decision are we trying to make?

## Context

Why does this decision matter to CampusSkill?

## Evidence

What reliable information was found?

## Options

What realistic options exist?

## Comparison

Compare the options using relevant criteria.

## Risks

What could go wrong?

## Recommendation

What technical or product approach is recommended?

## Confidence

Classify the recommendation as:

- High confidence
- Medium confidence
- Low confidence

## Open Questions

What remains uncertain?

## Decision Required

What requires Product Owner approval?

---

# 8. Evidence Rules

Do not present assumptions as facts.

Use these labels:

[FACT]

Supported by reliable evidence.

[ASSUMPTION]

Temporary assumption.

[RECOMMENDATION]

Suggested approach based on evidence and project requirements.

[NEEDS DECISION]

Requires Product Owner approval.

[RISK]

Potential problem that requires consideration.

---

# 9. Research and Product Requirements

Research must not silently change PRODUCT_SPEC.md.

If research suggests that a product requirement should change:

1. Document the research.
2. Explain the proposed change.
3. Mark it [NEEDS DECISION].
4. Obtain Product Owner approval.
5. Update PRODUCT_SPEC.md only after approval.

---

# 10. Research and Architecture

Research must be completed before finalizing the technical
architecture.

The architecture should be based on:

- Product requirements
- Research findings
- Security requirements
- Cost considerations
- Scalability requirements
- Development complexity
- Solo-founder constraints

---

# 11. Avoid Over-Engineering

Do not select a complicated architecture merely because it is
technically impressive.

CampusSkill is initially being developed as a small prototype.

Prefer:

Simple
→ Reliable
→ Testable
→ Maintainable
→ Expandable

over:

Complex
→ Expensive
→ Difficult to understand
→ Difficult to maintain

---

# 12. Free and Low-Cost Development

The prototype should prioritize tools and services that can be used
at zero or very low cost where practical.

However:

Do not assume a service will remain free.

Before production deployment, calculate actual expected costs.

Potential cost categories include:

- AI API
- Hosting
- Database
- File storage
- Email
- Authentication
- Domain
- Monitoring
- Backup
- Support
- Maintenance
- Taxes

---

# 13. AI Agent Research Workflow

When an AI development agent is asked to research:

1. Read PROJECT_CONTEXT.md.
2. Read DEVELOPMENT_RULES.md.
3. Read PRODUCT_SPEC.md.
4. Identify the exact research question.
5. Search appropriate sources.
6. Prefer primary sources.
7. Compare realistic alternatives.
8. Document evidence.
9. Identify risks.
10. Produce a recommendation.
11. Identify decisions requiring Product Owner approval.
12. Do not implement major changes automatically.

---

# 14. Research Before Coding

Before major implementation begins, the following areas should be
researched:

### Product

- MVP feasibility
- Student workflow
- Faculty workflow
- Institutional workflow

### Technology

- Frontend
- Backend
- Database
- Authentication
- Hosting
- File storage

### AI

- AI provider options
- AI evaluation architecture
- Structured output
- Cost
- Reliability

### Security

- Authentication
- Authorization
- Data privacy
- API security
- Secret management

### Testing

- Unit testing
- Integration testing
- End-to-end testing

### Deployment

- Development environment
- Testing environment
- Production deployment
- Backup and recovery

---

# 15. Research Deliverables

Before application implementation begins, the project should have:

1. Product Specification
2. Research Report
3. Technical Architecture
4. Database Specification
5. API Specification
6. AI Specification
7. Security Specification
8. Testing Strategy
9. Deployment Plan
10. Decision Log

Not every document must be large.

The goal is clarity, not paperwork.

---

# 16. Research Completion Standard

Research is complete when:

- The major question has been answered.
- Relevant alternatives have been considered.
- Important risks are identified.
- Evidence is documented.
- Open questions are listed.
- Product decisions are separated from technical recommendations.
- The Product Owner can understand the decision without needing
  programming expertise.

  ---

  # 17. Current Research Objective

  The immediate research objective is:

  Determine the most practical technology architecture for building the
  CampusSkill MVP as a solo founder using AI-assisted development and
  very low initial cost.

  The research must specifically consider:

  - Beginner-friendly development
  - Android/browser-based workflow
  - GitHub/Codespaces workflow
  - AI-assisted development
  - Low prototype cost
  - Security
  - Future scalability
  - Maintainability
  - AI provider flexibility

  No final technology stack has been selected yet.

  ---

  # 18. Important Rule

  Research must inform decisions.

  Research must not make decisions silently.

  The Product Owner remains responsible for approving major product and
  business decisions.

  The AI development agent is responsible for providing evidence,
  technical analysis and implementation assistance.