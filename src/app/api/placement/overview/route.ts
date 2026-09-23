import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { getPlacementScope } from "@/lib/placement-scope";
import { loadPlacementCounts } from "@/lib/placement-applications";
import {
  listCompanies,
} from "@/lib/placement-companies";
import {
  listOpportunities,
} from "@/lib/placement-opportunities";
import {
  listApplications,
} from "@/lib/placement-applications";
import {
  listPlacementResponsibilities,
} from "@/lib/placement-appointments";
import { PlacementValidationError } from "@/lib/placement-types";

/**
 * GET /api/placement/overview — role-aware placement hub data.
 * Real counts only; empty arrays when no data. system_admin denied.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const scope = await getPlacementScope(ctx);
    if (scope.access === "denied") {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "No placement access" },
        { status: 403 }
      );
    }

    const counts = await loadPlacementCounts(ctx);

    const canSeeCatalog =
      scope.access === "operator" ||
      scope.access === "approver" ||
      scope.access === "oversight";

    const [companies, opportunities, applications, appointments] =
      await Promise.all([
        canSeeCatalog
          ? listCompanies(ctx, { limit: 8 })
          : Promise.resolve([]),
        scope.access === "student"
          ? listOpportunities(ctx, { limit: 8 })
          : listOpportunities(ctx, { limit: 8 }),
        listApplications(ctx, {
          limit: scope.access === "student" ? 8 : 6,
          mine: scope.access === "student",
        }),
        canSeeCatalog
          ? listPlacementResponsibilities(ctx, { limit: 8 })
          : Promise.resolve([]),
      ]);

    return NextResponse.json({
      access: scope.access,
      roleName: ctx.roleName,
      canOperate: scope.canOperate,
      canApprove: scope.canApprove,
      canOversight: scope.canOversight,
      canManageAppointments: scope.canManageAppointments,
      counts,
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        industry: c.industry,
        location: c.location,
        opportunityCount: c.opportunity_count,
      })),
      opportunities: opportunities.map((o) => ({
        id: o.id,
        title: o.title,
        companyName: o.company_name,
        opportunityKind: o.opportunity_kind,
        status: o.status,
        applicationDeadline: o.application_deadline,
        applicationCount: o.application_count,
        location: o.location,
        compensation: o.compensation,
      })),
      applications: applications.map((a) => ({
        id: a.id,
        status: a.status,
        opportunityTitle: a.opportunity_title,
        studentName: a.student_name,
        companyName: a.company_name,
        submittedAt: a.submitted_at,
        isOwn: a.is_own,
      })),
      appointments: appointments.map((r) => ({
        id: r.id,
        personName: r.person_name,
        personRole: r.person_role,
        responsibility: r.responsibility,
        responsibilityTitle: r.responsibility_title,
        status: r.status,
        departmentName: r.department_name,
        startsOn: r.starts_on,
        endsOn: r.ends_on,
      })),
    });
  } catch (error) {
    if (error instanceof PlacementValidationError) {
      return NextResponse.json(
        { error: "VALIDATION", message: error.message },
        { status: 400 }
      );
    }
    if (error instanceof AuthzError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }
    return NextResponse.json(
      {
        error: "server_error",
        message: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
