/**
 * Placement & Career Foundation types + lifecycle guards (Milestone 9).
 */

export class PlacementValidationError extends Error {
  readonly code = "VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "PlacementValidationError";
  }
}

// ---------------------------------------------------------------------------
// Appointment / responsibility lifecycle
// ---------------------------------------------------------------------------

export const PLACEMENT_RESPONSIBILITIES = ["tpo", "placement_faculty"] as const;
export type PlacementResponsibilityKind =
  (typeof PLACEMENT_RESPONSIBILITIES)[number];

export const PLACEMENT_RESPONSIBILITY_STATUSES = [
  "pending",
  "active",
  "ended",
  "rejected",
] as const;
export type PlacementResponsibilityStatus =
  (typeof PLACEMENT_RESPONSIBILITY_STATUSES)[number];

// ---------------------------------------------------------------------------
// Company approval lifecycle
// ---------------------------------------------------------------------------

export const COMPANY_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "archived",
] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const COMPANY_TRANSITIONS: Record<CompanyStatus, CompanyStatus[]> = {
  draft: ["pending_approval", "archived"],
  pending_approval: ["approved", "rejected", "draft"],
  approved: ["archived", "pending_approval"],
  rejected: ["draft"],
  archived: ["draft"],
};

// ---------------------------------------------------------------------------
// Opportunity approval + publication lifecycle
// draft → pending_approval → approved | rejected → open → closed → archived
// ---------------------------------------------------------------------------

export const OPPORTUNITY_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "open",
  "closed",
  "archived",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_TRANSITIONS: Record<
  OpportunityStatus,
  OpportunityStatus[]
> = {
  draft: ["pending_approval", "archived"],
  pending_approval: ["approved", "rejected", "draft"],
  approved: ["open", "pending_approval", "archived"],
  rejected: ["draft"],
  open: ["closed", "archived"],
  closed: ["archived", "open"],
  archived: ["draft"],
};

export const OPPORTUNITY_KINDS = ["job", "internship"] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "internship",
  "apprenticeship",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Application pipeline
// ---------------------------------------------------------------------------

export const APPLICATION_STATUSES = [
  "submitted",
  "screening",
  "shortlisted",
  "interview",
  "selected",
  "offered",
  "joined",
  "offer_declined",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_TRANSITIONS: Record<
  ApplicationStatus,
  ApplicationStatus[]
> = {
  submitted: ["screening", "rejected", "withdrawn"],
  screening: ["shortlisted", "rejected", "withdrawn"],
  shortlisted: ["interview", "rejected", "withdrawn"],
  interview: ["selected", "rejected", "withdrawn"],
  selected: ["offered", "rejected"],
  offered: ["joined", "offer_declined", "rejected"],
  joined: [],
  offer_declined: [],
  rejected: [],
  withdrawn: [],
};

/** Statuses a student may move their own application to. */
export const STUDENT_APPLICATION_TRANSITIONS: Record<
  ApplicationStatus,
  ApplicationStatus[]
> = {
  submitted: ["withdrawn"],
  screening: ["withdrawn"],
  shortlisted: ["withdrawn"],
  interview: ["withdrawn"],
  selected: [],
  offered: ["offer_declined"],
  joined: [],
  offer_declined: [],
  rejected: [],
  withdrawn: [],
};

/** Statuses that count as an active placement outcome. */
export const ACTIVE_APPLICATION_STATUSES: ApplicationStatus[] = [
  "submitted",
  "screening",
  "shortlisted",
  "interview",
  "selected",
  "offered",
  "joined",
];

// ---------------------------------------------------------------------------
// Interview / offer / record
// ---------------------------------------------------------------------------

export const INTERVIEW_MODES = ["online", "in_person", "phone", "video"] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

export const INTERVIEW_STATUSES = [
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const INTERVIEW_OUTCOMES = ["selected", "waitlisted", "rejected"] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export const OFFER_STATUSES = ["pending", "accepted", "declined", "revoked"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const PLACEMENT_RECORD_STATUSES = [
  "joined",
  "offer_declined",
  "dropped",
] as const;
export type PlacementRecordStatus = (typeof PLACEMENT_RECORD_STATUSES)[number];

export const CAREER_READINESS = ["not_started", "in_progress", "ready"] as const;
export type CareerReadiness = (typeof CAREER_READINESS)[number];

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export function isCompanyStatus(v: unknown): v is CompanyStatus {
  return (
    typeof v === "string" && (COMPANY_STATUSES as readonly string[]).includes(v)
  );
}

export function canTransitionCompany(from: CompanyStatus, to: CompanyStatus) {
  return COMPANY_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isOpportunityStatus(v: unknown): v is OpportunityStatus {
  return (
    typeof v === "string" &&
    (OPPORTUNITY_STATUSES as readonly string[]).includes(v)
  );
}

export function canTransitionOpportunity(
  from: OpportunityStatus,
  to: OpportunityStatus
) {
  return OPPORTUNITY_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isOpportunityKind(v: unknown): v is OpportunityKind {
  return (
    typeof v === "string" &&
    (OPPORTUNITY_KINDS as readonly string[]).includes(v)
  );
}

export function isEmploymentType(v: unknown): v is EmploymentType {
  return (
    typeof v === "string" &&
    (EMPLOYMENT_TYPES as readonly string[]).includes(v)
  );
}

export function isApplicationStatus(v: unknown): v is ApplicationStatus {
  return (
    typeof v === "string" &&
    (APPLICATION_STATUSES as readonly string[]).includes(v)
  );
}

export function canTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus
) {
  return APPLICATION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canStudentTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus
) {
  return STUDENT_APPLICATION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isInterviewMode(v: unknown): v is InterviewMode {
  return typeof v === "string" && (INTERVIEW_MODES as readonly string[]).includes(v);
}

export function isInterviewStatus(v: unknown): v is InterviewStatus {
  return (
    typeof v === "string" &&
    (INTERVIEW_STATUSES as readonly string[]).includes(v)
  );
}

export function isInterviewOutcome(v: unknown): v is InterviewOutcome {
  return (
    typeof v === "string" &&
    (INTERVIEW_OUTCOMES as readonly string[]).includes(v)
  );
}

export function isOfferStatus(v: unknown): v is OfferStatus {
  return typeof v === "string" && (OFFER_STATUSES as readonly string[]).includes(v);
}

export function isPlacementRecordStatus(v: unknown): v is PlacementRecordStatus {
  return (
    typeof v === "string" &&
    (PLACEMENT_RECORD_STATUSES as readonly string[]).includes(v)
  );
}

export function isCareerReadiness(v: unknown): v is CareerReadiness {
  return typeof v === "string" && (CAREER_READINESS as readonly string[]).includes(v);
}

export function isPlacementResponsibility(
  v: unknown
): v is PlacementResponsibilityKind {
  return (
    typeof v === "string" &&
    (PLACEMENT_RESPONSIBILITIES as readonly string[]).includes(v)
  );
}

// ---------------------------------------------------------------------------
// Shared validation helpers
// ---------------------------------------------------------------------------

export function requireNonEmpty(value: unknown, field: string, max = 500): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) {
    throw new PlacementValidationError(`${field} is required`);
  }
  if (s.length > max) {
    throw new PlacementValidationError(`${field} must be at most ${max} characters`);
  }
  return s;
}

export function optionalText(value: unknown, field: string, max = 4000): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (s.length > max) {
    throw new PlacementValidationError(`${field} must be at most ${max} characters`);
  }
  return s;
}

/** Parse a comma/newline separated skill list into a clean string array. */
export function parseTagList(value: unknown, maxItems = 40, maxLen = 60): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v).trim())
      .filter(Boolean)
      .slice(0, maxItems)
      .map((v) => v.slice(0, maxLen));
  }
  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, maxItems)
      .map((v) => v.slice(0, maxLen));
  }
  return [];
}
