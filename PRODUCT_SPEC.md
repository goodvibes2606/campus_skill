# CampusSkill — Product Specification

## 1. Product Identity

Product Name:

CampusSkill

Product Type:

AI-powered academic-to-career platform for college students.

Primary Goal:

Help college students convert academic learning into practical skills,
demonstrable evidence and career readiness.

Core Product Loop:

Learn → Practice → Apply → Get Evaluated → Improve → Build Evidence → Become Career Ready

---

# 2. Product Problem

Many college students learn academic concepts but have limited
opportunities to demonstrate how those concepts can be applied to
real-world situations.

CampusSkill is designed to connect:

Academic Knowledge
↓
Practical Application
↓
AI-assisted Evaluation
↓
Skill Development
↓
Evidence
↓
Career Readiness

The product should help students understand not only what they know,
but how effectively they can apply their knowledge.

---

# 3. Target Users

## 3.1 Student

Primary user of the platform.

Students use CampusSkill to:

- Learn
- Practice
- Solve real-world cases
- Complete simulations
- Receive AI-assisted feedback
- Identify skill gaps
- Build evidence
- Develop a Skill Passport

---

## 3.2 Faculty

Faculty members use CampusSkill to:

- View students
- Monitor student performance
- Review skill development
- Provide feedback
- Verify selected student evidence
- Understand common skill gaps

---

## 3.3 Admin

Institution administrators use CampusSkill to:

- Manage students
- Manage faculty
- Manage subjects
- Manage institutional information
- Monitor platform usage
- View basic institutional analytics

---

## 3.4 Recruiter

Recruiter functionality is a future-phase feature.

Do not implement recruiter functionality in the initial MVP.

---

# 4. Initial Market

The first pilot should be conducted within the founder's college
environment.

After validation, the product may expand to:

1. PTU-affiliated colleges
2. Other Indian colleges
3. Other higher-education institutions

The initial prototype should not be designed around large-scale
institutional complexity.

---

# 5. Languages

Required product languages:

1. English
2. Hindi
3. Punjabi

The technical architecture should support adding additional Indian
languages later.

The first functional prototype may initially prioritize English
content while keeping the architecture ready for localization.

---

# 6. Core Product Engines

## 6.1 Skill Passport

The Skill Passport is a student's evolving record of demonstrated
skills.

It should eventually contain:

- Skill name
- Skill category
- Skill level
- Evidence
- Activities completed
- Assessment results
- AI evaluation
- Faculty verification
- Improvement history

Important:

AI-generated results must not automatically become officially verified
competencies.

Formal verification may require faculty or institutional approval.

---

## 6.2 Study-to-Job Simulator

The simulator connects academic concepts with practical situations.

Example:

A Marketing Management student receives a realistic business problem.

The student analyzes the situation and submits a response.

CampusSkill evaluates the response against a defined rubric and
provides:

- Score
- Strengths
- Weaknesses
- Explanation
- Improvement suggestions
- Recommended next activity

The student can then improve and attempt another activity.

---

## 6.3 Internship Evidence Builder

This is a future module.

It should eventually allow students to record:

- Internship
- Organization
- Role
- Activities
- Problems encountered
- Solutions
- Skills used
- Evidence
- Faculty/mentor feedback

Do not implement the complete internship system during the initial
MVP.

---

# 7. MVP Scope

The first MVP must remain small and functional.

## Student MVP

Required:

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

---

## Faculty MVP

Required:

- Authentication
- Faculty dashboard
- Student list
- Student performance
- Skill analytics
- Faculty feedback
- Evidence verification for selected activities

---

## Admin MVP

Required:

- Authentication
- Institution dashboard
- Student management
- Faculty management
- Subject management
- Basic usage analytics

---

# 8. Student User Journey

The initial student journey should be:

1. Student creates an account.
2. Student signs in.
3. Student completes basic profile.
4. Student selects academic subjects.
5. Student opens a case study.
6. Student reads the real-world problem.
7. Student submits an answer.
8. AI evaluates the answer.
9. Student receives structured feedback.
10. Relevant skill scores are updated.
11. Student sees the result in the Skill Passport.
12. Student receives a recommended improvement activity.
13. Student completes additional practice.

The first major product experience should demonstrate this complete
learning loop.

---

# 9. Faculty User Journey

The initial faculty journey should be:

1. Faculty signs in.
2. Faculty opens the dashboard.
3. Faculty views assigned students.
4. Faculty views student activity.
5. Faculty views performance and skill development.
6. Faculty reviews selected evidence.
7. Faculty provides feedback.
8. Faculty verifies appropriate evidence where required.

---

# 10. Admin User Journey

The initial admin journey should be:

1. Admin signs in.
2. Admin opens institution dashboard.
3. Admin manages students.
4. Admin manages faculty.
5. Admin manages subjects.
6. Admin reviews basic usage information.

---

# 11. Initial Academic Domains

The initial content may focus on subjects relevant to the founder's
academic expertise.

Initial subjects may include:

- Marketing Management
- Human Resource Management
- Principles and Practices of Management
- Business Organization and Management

The architecture must allow additional subjects and disciplines to be
added later.

---

# 12. Case Study Structure

Each case study should eventually contain:

- Title
- Subject
- Topic
- Difficulty
- Situation
- Background
- Problem
- Student task
- Expected response type
- Relevant skills
- Evaluation rubric
- Recommended time
- Learning objective

The case library should be structured so that new cases can be added
without changing application code.

---

# 13. AI Evaluation

AI evaluation should use structured rubrics.

Example initial rubric:

| Criterion | Weight |
|---|---:|
| Conceptual Understanding | 20 |
| Problem Analysis | 20 |
| Application of Knowledge | 20 |
| Decision Making | 15 |
| Creativity | 10 |
| Communication | 15 |
| Total | 100 |

This rubric is an initial product example and may be modified after
testing.

AI evaluation should produce structured information such as:

- Criterion scores
- Total score
- Strengths
- Areas for improvement
- Explanation
- Recommended next activity

AI output should be predictable and structured rather than only
returning free-form text.

---

# 14. Skill Model

Skills should eventually be organized into categories.

Possible categories include:

- Communication
- Problem Solving
- Analytical Thinking
- Decision Making
- Leadership
- Teamwork
- Creativity
- Digital Skills
- Business Knowledge
- Domain Skills

The initial implementation should use only the skills required by the
MVP.

Do not create an unnecessarily large skill taxonomy before validation.

---

# 15. Skill Score Philosophy

Skill scores are indicators of demonstrated performance.

They should be based on evidence such as:

- Case activities
- Simulations
- Assessments
- Projects
- Faculty feedback
- Verified evidence

AI-generated scores should be clearly distinguishable from formally
verified competency.

---

# 16. Dashboard

## Student Dashboard

The initial student dashboard should provide:

- Welcome/profile area
- Current subjects
- Recent activities
- Skill progress
- Recommended activity
- Recent evaluation
- Skill Passport access

The dashboard should prioritize useful information over visual
complexity.

---

## Faculty Dashboard

The initial faculty dashboard should provide:

- Student count
- Recent student activity
- Performance overview
- Skill development overview
- Students requiring attention
- Recent faculty feedback activity

---

## Admin Dashboard

The initial admin dashboard should provide:

- Student count
- Faculty count
- Subject count
- Platform activity
- Basic usage information

---

# 17. Navigation

The application should use role-based navigation.

Possible student navigation:

- Dashboard
- Learn
- Practice
- Skills
- Activity
- Profile

Future navigation may include:

- Internships
- Career
- Portfolio
- Opportunities

Do not implement future navigation unless required by the current MVP.

---

# 18. Authentication

The application requires authentication.

Authentication must support role-aware access.

Initial roles:

- Student
- Faculty
- Admin

Users must only access functionality appropriate to their role.

---

# 19. Data Privacy

Student information must be protected.

A student must not be able to access another student's private
information.

Faculty access must be limited to authorized institutional data.

Admin access must follow explicit permissions.

Sensitive information must not be exposed unnecessarily.

---

# 20. AI Provider Architecture

The application must not permanently depend on one AI provider.

AI functionality should be accessed through an abstraction or service
layer.

Potential providers include:

- Gemini
- OpenAI
- Other compatible providers

The application should make it possible to change providers without
rewriting the entire product.

API keys must remain server-side.

---

# 21. AI Roles

CampusSkill AI has three conceptual roles.

## AI Assistant

Helps students understand and navigate learning activities.

## AI Coach

Provides improvement suggestions and recommends practice.

## AI Evaluator

Evaluates student responses using approved rubrics.

These roles may initially use the same underlying AI service.

A complex multi-agent architecture is not required for the first MVP.

---

# 22. Faculty Verification

Faculty verification is an important trust mechanism.

The platform should distinguish between:

AI Generated Result

and

Faculty / Institution Verified Evidence

A student should not receive an official institutional competency claim
solely because an AI model generated a high score.

---

# 23. Future Features

The following features may be developed after MVP validation:

- Internship Evidence Builder
- Advanced portfolio
- Career readiness analysis
- Resume builder
- Interview practice
- Mock interviews
- Job opportunities
- Internship opportunities
- Recruiter portal
- Candidate search
- Skill-based recruitment
- Institutional analytics
- Payments
- Advanced multilingual content
- Android application

These are not part of the initial MVP.

---

# 24. Business Model

Long-term model:

B2B / B2B2C institutional SaaS.

Possible pricing structure:

Per-student institutional licensing.

An initial reference price may be around:

₹500 per student per year

This is an unconfirmed assumption, not a final price.

Final pricing must be determined using actual:

- AI usage cost
- Hosting cost
- Database cost
- Storage cost
- Support cost
- Maintenance cost
- Institutional value
- Taxes
- Other operating expenses

The first objective is product validation rather than maximizing revenue.

---

# 25. MVP Success Criteria

The first MVP should be considered functionally successful when a
student can complete the following journey:

Register
→ Login
→ Select Subject
→ Open Case
→ Submit Answer
→ Receive AI Evaluation
→ View Feedback
→ View Skill Result
→ View Skill Passport
→ Receive Recommended Practice

Faculty should be able to:

Login
→ View Student
→ View Performance
→ Review Evidence
→ Provide Feedback
→ Verify Selected Evidence

Admin should be able to:

Login
→ View Institution
→ Manage Students
→ Manage Faculty
→ Manage Subjects
→ View Basic Usage

---

# 26. Product Principles

CampusSkill should follow these principles:

1. Practical application over passive learning.
2. Evidence over unsupported claims.
3. Structured evaluation over arbitrary scoring.
4. Faculty verification where institutional trust is required.
5. Simple MVP before complex platform.
6. Modular architecture.
7. Provider-independent AI architecture.
8. Privacy and security by design.
9. Mobile-responsive web experience.
10. Continuous improvement through real student usage.

---

# 27. Product Decisions

[CONFIRMED]

Product name: CampusSkill

[CONFIRMED]

Initial roles:

- Student
- Faculty
- Admin

[CONFIRMED]

Future role:

- Recruiter

[CONFIRMED]

Required languages:

- English
- Hindi
- Punjabi

[CONFIRMED]

Initial platform:

Responsive web application.

[CONFIRMED]

Android application:

Future phase.

[ASSUMPTION]

Initial institutional pricing reference:

₹500/student/year.

[NEEDS DECISION]

Final pricing.

[NEEDS DECISION]

Final AI provider selection.

[NEEDS DECISION]

Final technology stack.

[NEEDS DECISION]

Final database architecture.

---

# 28. Current Development Scope

Current phase:

PHASE 0 — Development Environment

Current objective:

Complete project documentation and architecture planning before
application implementation.

No application feature should be implemented merely because it appears
in this document.

Implementation begins only after the relevant architecture and
development decisions have been reviewed.

---

# 29. Product Owner

The founder is the Product Owner and academic subject-matter expert.

The Product Owner has final authority over product requirements,
academic workflows and major business decisions.

AI agents may research, recommend, design and implement approved work,
but must not silently change confirmed product requirements.

---

# 30. Definition of a Good MVP

A good CampusSkill MVP is not the application with the largest number
of features.

A good MVP is the smallest reliable system that proves that students
can:

Learn
→ Practice
→ Apply
→ Get Evaluated
→ Improve
→ Build Evidence

and that faculty can meaningfully review and verify selected evidence.