/**
 * Academic assessment types + transitions (Milestone 6).
 * Does not use DATABASE_SPEC "assessments" (case-study simulator reserve).
 */

export const ASSIGNMENT_STATUSES = [
  "draft",
  "published",
  "closed",
  "archived",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_TRANSITIONS: Record<
  AssignmentStatus,
  AssignmentStatus[]
> = {
  draft: ["published", "archived"],
  published: ["closed", "draft", "archived"],
  closed: ["archived", "published"],
  archived: ["draft"],
};

export const SUBMISSION_STATUSES = [
  "draft",
  "submitted",
  "returned",
  "graded",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const QUESTION_BANK_STATUSES = [
  "draft",
  "approved",
  "retired",
] as const;
export type QuestionBankStatus = (typeof QUESTION_BANK_STATUSES)[number];

export const QUESTION_BANK_TRANSITIONS: Record<
  QuestionBankStatus,
  QuestionBankStatus[]
> = {
  draft: ["approved", "retired"],
  approved: ["retired", "draft"],
  retired: ["draft"],
};

export const QUESTION_TYPES = [
  "mcq",
  "short",
  "long",
  "numerical",
  "true_false",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const PAPER_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "published",
  "archived",
] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];

export const PAPER_TRANSITIONS: Record<PaperStatus, PaperStatus[]> = {
  draft: ["in_review", "archived"],
  in_review: ["approved", "draft", "archived"],
  approved: ["published", "in_review", "archived"],
  published: ["archived", "approved"],
  archived: ["draft"],
};

export const MST_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "published",
  "archived",
] as const;
export type MstStatus = (typeof MST_STATUSES)[number];

export const MST_TRANSITIONS: Record<MstStatus, MstStatus[]> = {
  draft: ["in_review", "archived"],
  in_review: ["approved", "draft", "archived"],
  approved: ["published", "in_review", "archived"],
  published: ["archived", "approved"],
  archived: ["draft"],
};

export const PAPER_KINDS = [
  "assignment",
  "quiz",
  "mst",
  "final",
  "practice",
] as const;
export type PaperKind = (typeof PAPER_KINDS)[number];

export class AssessmentValidationError extends Error {
  readonly code = "VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "AssessmentValidationError";
  }
}

export function isAssignmentStatus(v: unknown): v is AssignmentStatus {
  return (
    typeof v === "string" &&
    (ASSIGNMENT_STATUSES as readonly string[]).includes(v)
  );
}

export function canTransitionAssignment(
  from: AssignmentStatus,
  to: AssignmentStatus
): boolean {
  return ASSIGNMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isSubmissionStatus(v: unknown): v is SubmissionStatus {
  return (
    typeof v === "string" &&
    (SUBMISSION_STATUSES as readonly string[]).includes(v)
  );
}

export function isQuestionBankStatus(v: unknown): v is QuestionBankStatus {
  return (
    typeof v === "string" &&
    (QUESTION_BANK_STATUSES as readonly string[]).includes(v)
  );
}

export function canTransitionQuestionBank(
  from: QuestionBankStatus,
  to: QuestionBankStatus
): boolean {
  return QUESTION_BANK_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isQuestionType(v: unknown): v is QuestionType {
  return (
    typeof v === "string" &&
    (QUESTION_TYPES as readonly string[]).includes(v)
  );
}

export function isPaperStatus(v: unknown): v is PaperStatus {
  return (
    typeof v === "string" && (PAPER_STATUSES as readonly string[]).includes(v)
  );
}

export function canTransitionPaper(
  from: PaperStatus,
  to: PaperStatus
): boolean {
  return PAPER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isMstStatus(v: unknown): v is MstStatus {
  return typeof v === "string" && (MST_STATUSES as readonly string[]).includes(v);
}

export function canTransitionMst(from: MstStatus, to: MstStatus): boolean {
  return MST_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isPaperKind(v: unknown): v is PaperKind {
  return typeof v === "string" && (PAPER_KINDS as readonly string[]).includes(v);
}

export function parseDateOnly(v: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "")) {
    throw new AssessmentValidationError(`${field} must be YYYY-MM-DD`);
  }
  return v;
}
