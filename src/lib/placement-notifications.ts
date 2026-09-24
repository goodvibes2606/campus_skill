import type { AuthContext } from "@/lib/authz";
import { createNotification, notifyInstitution } from "@/lib/notifications";
import { pool } from "@/lib/db";

/**
 * Placement notification helpers (Milestone 9).
 * Events follow domain.action (letters/digits/underscore) required by
 * createNotification. Channels stay provider-independent.
 */

export const PLACEMENT_EVENTS = {
  opportunityOpened: "placement.opportunity_opened",
  applicationSubmitted: "placement.application_submitted",
  applicationStatus: "placement.application_status",
  interviewScheduled: "placement.interview_scheduled",
  offerReceived: "placement.offer_received",
  offerDecided: "placement.offer_decided",
  approvalRequired: "placement.approval_required",
  appointmentRequested: "placement.appointment_requested",
  appointmentDecided: "placement.appointment_decided",
} as const;

async function activeTpoId(institutionId: string): Promise<string | null> {
  const r = await pool.query<{ person_id: string }>(
    `SELECT person_id FROM public.placement_responsibilities
      WHERE institution_id = $1 AND responsibility = 'tpo' AND status = 'active'
      LIMIT 1`,
    [institutionId]
  );
  return r.rows[0]?.person_id ?? null;
}

async function directorIds(institutionId: string): Promise<string[]> {
  const r = await pool.query<{ id: string }>(
    `SELECT p.id
       FROM public.profiles p
       JOIN public.roles ro ON ro.id = p.role_id
      WHERE p.institution_id = $1
        AND p.status = 'active'
        AND ro.name = 'director_dean'`,
    [institutionId]
  );
  return r.rows.map((row) => row.id);
}

/** Notify institution Director/Dean roles (approval queue). */
async function notifyDirectors(
  ctx: AuthContext,
  institutionId: string,
  event: string,
  title: string,
  body: string,
  priority: "high" | "normal" = "normal"
): Promise<void> {
  const directors = await directorIds(institutionId);
  for (const id of directors) {
    await createNotification(ctx, {
      recipientId: id,
      event,
      title,
      body,
      priority,
      institutionId,
      skipSelf: true,
    });
  }
}

/** Notify the active TPO (if any). */
async function notifyActiveTpo(
  ctx: AuthContext,
  institutionId: string,
  event: string,
  title: string,
  body: string,
  priority: "high" | "normal" = "normal"
): Promise<void> {
  const tpoId = await activeTpoId(institutionId);
  if (!tpoId) return;
  await createNotification(ctx, {
    recipientId: tpoId,
    event,
    title,
    body,
    priority,
    institutionId,
    skipSelf: true,
  });
}

export async function notifyOpportunityOpened(
  ctx: AuthContext,
  input: { institutionId: string; title: string; opportunityId: string }
): Promise<void> {
  await notifyInstitution({
    institutionId: input.institutionId,
    event: PLACEMENT_EVENTS.opportunityOpened,
    title: `New placement opportunity: ${input.title}`,
    body: "A new open opportunity is available. Check Placement → Opportunities.",
    priority: "normal",
    excludeUserId: ctx.userId,
    createdBy: ctx.userId,
    roleNames: ["student"],
  });
}

export async function notifyApplicationSubmitted(
  ctx: AuthContext,
  input: { institutionId: string; title: string; studentName: string }
): Promise<void> {
  await notifyActiveTpo(
    ctx,
    input.institutionId,
    PLACEMENT_EVENTS.applicationSubmitted,
    `New application: ${input.title}`,
    `${input.studentName} submitted an application.`,
    "normal"
  );
}

export async function notifyApplicationStatus(
  ctx: AuthContext,
  input: {
    studentId: string;
    institutionId: string;
    title: string;
    status: string;
  }
): Promise<void> {
  await createNotification(ctx, {
    recipientId: input.studentId,
    event: PLACEMENT_EVENTS.applicationStatus,
    title: `Application update: ${input.title}`,
    body: `Your application status is now “${input.status}”.`,
    priority: "normal",
    institutionId: input.institutionId,
    skipSelf: true,
  });
}

export async function notifyInterviewScheduled(
  ctx: AuthContext,
  input: {
    studentId: string;
    institutionId: string;
    title: string;
    when: string;
  }
): Promise<void> {
  await createNotification(ctx, {
    recipientId: input.studentId,
    event: PLACEMENT_EVENTS.interviewScheduled,
    title: `Interview scheduled: ${input.title}`,
    body: `Scheduled for ${input.when}.`,
    priority: "high",
    institutionId: input.institutionId,
    skipSelf: true,
  });
}

export async function notifyOfferReceived(
  ctx: AuthContext,
  input: {
    studentId: string;
    institutionId: string;
    title: string;
    compensation?: string | null;
  }
): Promise<void> {
  await createNotification(ctx, {
    recipientId: input.studentId,
    event: PLACEMENT_EVENTS.offerReceived,
    title: `Offer received: ${input.title}`,
    body: input.compensation
      ? `Compensation: ${input.compensation}. Review and accept or decline.`
      : "You have a pending offer to review.",
    priority: "high",
    institutionId: input.institutionId,
    skipSelf: true,
  });
}

export async function notifyApprovalRequired(
  ctx: AuthContext,
  input: {
    institutionId: string;
    kind: "company" | "opportunity" | "appointment";
    name: string;
  }
): Promise<void> {
  const title =
    input.kind === "company"
      ? `Company awaiting approval: ${input.name}`
      : input.kind === "opportunity"
        ? `Opportunity awaiting approval: ${input.name}`
        : `Appointment awaiting approval: ${input.name}`;
  await notifyDirectors(
    ctx,
    input.institutionId,
    PLACEMENT_EVENTS.approvalRequired,
    title,
    "Open Placement → Approvals to review.",
    "high"
  );
}

export async function notifyAppointmentRequested(
  ctx: AuthContext,
  input: { institutionId: string; personName: string; responsibility: string }
): Promise<void> {
  await notifyDirectors(
    ctx,
    input.institutionId,
    PLACEMENT_EVENTS.appointmentRequested,
    `Appointment request: ${input.personName}`,
    `A pending “${input.responsibility}” appointment awaits Director/Dean approval.`,
    "high"
  );
}

export async function notifyAppointmentDecided(
  ctx: AuthContext,
  input: {
    personId: string;
    institutionId: string;
    responsibility: string;
    decision: string;
  }
): Promise<void> {
  await createNotification(ctx, {
    recipientId: input.personId,
    event: PLACEMENT_EVENTS.appointmentDecided,
    title: `Placement appointment ${input.decision}`,
    body: `Your “${input.responsibility}” appointment was ${input.decision}.`,
    priority: "high",
    institutionId: input.institutionId,
    skipSelf: true,
  });
}
