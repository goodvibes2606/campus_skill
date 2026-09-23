/**
 * Syllabus / calendar / daily-work / notification type guards (Milestone 5).
 */

export const SYLLABUS_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "published",
  "archived",
] as const;
export type SyllabusStatus = (typeof SYLLABUS_STATUSES)[number];

/** Allowed forward/back transitions for syllabus lifecycle. */
export const SYLLABUS_TRANSITIONS: Record<SyllabusStatus, SyllabusStatus[]> = {
  draft: ["in_review", "archived"],
  in_review: ["approved", "draft", "archived"],
  approved: ["published", "in_review", "archived"],
  published: ["archived", "approved"],
  archived: ["draft"],
};

export const SYLLABUS_SOURCE_TYPES = [
  "faculty_prepared",
  "institution_supplied",
  "imported",
  "unverified",
] as const;
export type SyllabusSourceType = (typeof SYLLABUS_SOURCE_TYPES)[number];

export const CALENDAR_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "published",
  "archived",
] as const;
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];

export const CALENDAR_TRANSITIONS: Record<CalendarStatus, CalendarStatus[]> = {
  draft: ["pending_approval", "archived"],
  pending_approval: ["approved", "rejected", "draft"],
  approved: ["published", "pending_approval", "archived"],
  rejected: ["draft"],
  published: ["archived"],
  archived: ["draft"],
};

export const CALENDAR_EVENT_TYPES = [
  "event",
  "holiday",
  "exam",
  "deadline",
  "class_start",
  "class_end",
  "meeting",
  "other",
] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export const DAILY_WORK_STATUSES = [
  "draft",
  "submitted",
  "acknowledged",
  "returned",
] as const;
export type DailyWorkStatus = (typeof DAILY_WORK_STATUSES)[number];

export const DAILY_WORK_ITEM_TYPES = [
  "lecture",
  "lab",
  "tutorial",
  "exam_duty",
  "meeting",
  "mentoring",
  "other",
] as const;
export type DailyWorkItemType = (typeof DAILY_WORK_ITEM_TYPES)[number];

export const NOTIFICATION_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export class AcademicOpsValidationError extends Error {
  readonly code = "VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "AcademicOpsValidationError";
  }
}

export function isSyllabusStatus(v: unknown): v is SyllabusStatus {
  return (
    typeof v === "string" &&
    (SYLLABUS_STATUSES as readonly string[]).includes(v)
  );
}

export function canTransitionSyllabus(
  from: SyllabusStatus,
  to: SyllabusStatus
): boolean {
  return SYLLABUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isSyllabusSourceType(v: unknown): v is SyllabusSourceType {
  return (
    typeof v === "string" &&
    (SYLLABUS_SOURCE_TYPES as readonly string[]).includes(v)
  );
}

export function isCalendarStatus(v: unknown): v is CalendarStatus {
  return (
    typeof v === "string" &&
    (CALENDAR_STATUSES as readonly string[]).includes(v)
  );
}

export function canTransitionCalendar(
  from: CalendarStatus,
  to: CalendarStatus
): boolean {
  return CALENDAR_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isCalendarEventType(v: unknown): v is CalendarEventType {
  return (
    typeof v === "string" &&
    (CALENDAR_EVENT_TYPES as readonly string[]).includes(v)
  );
}

export function isDailyWorkStatus(v: unknown): v is DailyWorkStatus {
  return (
    typeof v === "string" &&
    (DAILY_WORK_STATUSES as readonly string[]).includes(v)
  );
}

export function isDailyWorkItemType(v: unknown): v is DailyWorkItemType {
  return (
    typeof v === "string" &&
    (DAILY_WORK_ITEM_TYPES as readonly string[]).includes(v)
  );
}

export function isNotificationPriority(
  v: unknown
): v is NotificationPriority {
  return (
    typeof v === "string" &&
    (NOTIFICATION_PRIORITIES as readonly string[]).includes(v)
  );
}
