import { ROLES } from "@/lib/authz";
import type { AiContextKind, AiFeature } from "@/lib/ai/types";

/**
 * Role-aware AI feature matrix (Milestone 10).
 * Institutional assistance layer — AI never replaces faculty judgment,
 * HOD/Director approval, institutional authority, or server-side authz.
 */

export type AiFeatureMeta = {
  id: AiFeature;
  label: string;
  detail: string;
  /** Context kinds this feature may attach (server-validated). */
  contextKinds: AiContextKind[];
  /** Placeholder / suggested prompt shown in the workspace. */
  placeholder: string;
};

export const AI_FEATURES: Record<AiFeature, AiFeatureMeta> = {
  explain_topic: {
    id: "explain_topic",
    label: "Explain a topic",
    detail: "Clear explanation of an academic concept or syllabus topic.",
    contextKinds: ["subject", "syllabus", "resource"],
    placeholder: "Explain this topic in simple terms with an example…",
  },
  summarize_content: {
    id: "summarize_content",
    label: "Summarize content",
    detail: "Summarize an authorized academic resource or unit.",
    contextKinds: ["resource", "syllabus", "subject", "assignment"],
    placeholder: "Summarize the attached authorized content…",
  },
  revision_questions: {
    id: "revision_questions",
    label: "Revision questions",
    detail: "Practice questions for revision and study checks.",
    contextKinds: ["subject", "syllabus", "resource", "assignment"],
    placeholder: "Create revision questions for this material…",
  },
  explain_terms: {
    id: "explain_terms",
    label: "Explain terminology",
    detail: "Explain difficult terms and jargon.",
    contextKinds: ["subject", "syllabus", "resource", "assignment"],
    placeholder: "Explain these difficult terms…",
  },
  study_outline: {
    id: "study_outline",
    label: "Study outline",
    detail: "Structured revision/study outline.",
    contextKinds: ["subject", "syllabus", "resource"],
    placeholder: "Create a study outline for this unit…",
  },
  assignment_help: {
    id: "assignment_help",
    label: "Assignment guidance",
    detail: "Understand requirements and plan your approach (not answers).",
    contextKinds: ["assignment", "subject"],
    placeholder: "Help me understand what this assignment requires…",
  },
  teaching_support: {
    id: "teaching_support",
    label: "Teaching support",
    detail: "Teaching assistance and content organization drafts.",
    contextKinds: ["subject", "syllabus", "resource", "assignment"],
    placeholder: "Draft teaching notes for this class…",
  },
  question_drafting: {
    id: "question_drafting",
    label: "Question / quiz drafting",
    detail: "Draft practice questions or quiz items for review.",
    contextKinds: ["subject", "syllabus", "assignment"],
    placeholder: "Draft quiz questions for this unit…",
  },
  lesson_planning: {
    id: "lesson_planning",
    label: "Lesson / lecture plan",
    detail: "Lesson or lecture planning draft.",
    contextKinds: ["subject", "syllabus"],
    placeholder: "Draft a lecture plan covering these topics…",
  },
  institution_summary: {
    id: "institution_summary",
    label: "Institution summary",
    detail: "Authorized academic/institutional information summary (decision-support only).",
    contextKinds: ["general"],
    placeholder: "Summarize authorized institutional information…",
  },
  placement_summary: {
    id: "placement_summary",
    label: "Placement summary",
    detail: "Placement/opportunity information within authorized scope.",
    contextKinds: ["opportunity", "general"],
    placeholder: "Summarize this opportunity within my placement scope…",
  },
  technical_help: {
    id: "technical_help",
    label: "Technical help",
    detail: "System/technical assistance only — no academic or confidential data.",
    contextKinds: ["general"],
    placeholder: "Describe the technical issue…",
  },
};

/** Features each role may use. Client nav is UX only — API re-checks. */
const ROLE_FEATURES: Record<string, AiFeature[]> = {
  [ROLES.student]: [
    "explain_topic",
    "summarize_content",
    "revision_questions",
    "explain_terms",
    "study_outline",
    "assignment_help",
  ],
  [ROLES.faculty]: [
    "explain_topic",
    "summarize_content",
    "revision_questions",
    "explain_terms",
    "teaching_support",
    "question_drafting",
    "lesson_planning",
    "assignment_help",
  ],
  [ROLES.hod]: [
    "institution_summary",
    "summarize_content",
    "explain_topic",
    "teaching_support",
    "question_drafting",
  ],
  [ROLES.directorDean]: [
    "institution_summary",
    "placement_summary",
    "summarize_content",
  ],
  [ROLES.admin]: ["institution_summary", "summarize_content"],
  [ROLES.tpo]: ["placement_summary", "summarize_content", "institution_summary"],
  [ROLES.systemAdmin]: ["technical_help"],
  // recruiter / unknown: no AI features.
  [ROLES.recruiter]: [],
};

export function featuresForRole(roleName: string): AiFeature[] {
  return ROLE_FEATURES[roleName] ?? [];
}

export function isFeatureAllowed(roleName: string, feature: AiFeature): boolean {
  return featuresForRole(roleName).includes(feature);
}

export function canUseAi(roleName: string): boolean {
  return featuresForRole(roleName).length > 0;
}

/**
 * Context kinds a role may attach. system_admin is technical-only —
 * must never pull academic/placement context through AI.
 */
export function allowedContextKinds(roleName: string): AiContextKind[] {
  if (roleName === ROLES.systemAdmin) return ["general"];
  if (roleName === ROLES.student) {
    return ["subject", "resource", "assignment", "syllabus", "general"];
  }
  if (roleName === ROLES.tpo) return ["opportunity", "general"];
  if (roleName === ROLES.directorDean) return ["opportunity", "general"];
  if (roleName === ROLES.admin) return ["general"];
  if (roleName === ROLES.hod || roleName === ROLES.faculty) {
    return ["subject", "resource", "assignment", "syllabus", "general"];
  }
  return ["general"];
}

/** Role-aware suggested actions for the workspace UI. */
export function suggestedFeatures(roleName: string): AiFeatureMeta[] {
  return featuresForRole(roleName).map((f) => AI_FEATURES[f]);
}
