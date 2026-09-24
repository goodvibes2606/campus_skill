import { NextResponse } from "next/server";

import { AuthzError, getAuthContext, ROLES } from "@/lib/authz";
import { assertCanEnrollStudent } from "@/lib/academic-scope";
import {
  enrollStudent,
  endEnrollment,
  getActiveEnrollment,
  listEnrollments,
} from "@/lib/enrollment";

/**
 * POST — enroll a student into a section (admin/HOD/coordinator scoped).
 * Body: { studentId, sectionId, action?: 'enroll' | 'end', enrollmentId?, status? }
 *
 * GET ?studentId= — enrollment history (own student, or admin/HOD/coordinator).
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const body = (await request.json()) as {
      studentId?: string;
      sectionId?: string;
      action?: "enroll" | "end";
      enrollmentId?: string;
      status?: "completed" | "dropped" | "transferred";
    };

    if (body.action === "end") {
      if (!body.enrollmentId || !body.status) {
        return NextResponse.json(
          { error: "enrollmentId and status are required to end enrollment" },
          { status: 400 }
        );
      }
      const ended = await endEnrollment(ctx, body.enrollmentId, body.status);
      return NextResponse.json({
        id: ended.id,
        status: ended.status,
        endedAt: ended.ended_at,
        sectionId: ended.section_id,
      });
    }

    if (!body.studentId || !body.sectionId) {
      return NextResponse.json(
        { error: "studentId and sectionId are required" },
        { status: 400 }
      );
    }

    await assertCanEnrollStudent(ctx, body.sectionId);
    const enrollment = await enrollStudent(ctx, {
      studentId: body.studentId,
      sectionId: body.sectionId,
    });

    return NextResponse.json({
      id: enrollment.id,
      status: enrollment.status,
      studentId: enrollment.student_id,
      sectionId: enrollment.section_id,
      sectionName: enrollment.section_name,
      programCode: enrollment.program_code,
      academicYear: enrollment.academic_year_name,
      semesterNumber: enrollment.semester_number,
      enrolledAt: enrollment.enrolled_at,
    });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }
    return NextResponse.json(
      {
        error: "server_error",
        message: "Something went wrong. Try again.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");

    const targetId = studentId ?? ctx.userId;

    // Students: own enrollment only.
    if (ctx.roleName === ROLES.student) {
      if (targetId !== ctx.userId) {
        return NextResponse.json(
          { error: "FORBIDDEN", message: "Students may only read own enrollment" },
          { status: 403 }
        );
      }
      const active = await getActiveEnrollment(ctx.userId);
      const history = await listEnrollments(ctx, ctx.userId);
      return NextResponse.json({ active, history });
    }

    // system_admin: technical only — no student academic history browsing.
    if (ctx.roleName === ROLES.systemAdmin) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "System administration has no enrollment read access" },
        { status: 403 }
      );
    }

    // recruiter / unknown roles: deny.
    if (
      ![
        ROLES.admin,
        ROLES.hod,
        ROLES.directorDean,
        ROLES.faculty,
        ROLES.tpo,
      ].includes(ctx.roleName as never)
    ) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Enrollment history not available for your role" },
        { status: 403 }
      );
    }

    // Staff reading another student — institution-scoped (listEnrollments).
    if (targetId !== ctx.userId && !ctx.institutionId) {
      return NextResponse.json(
        { error: "NO_INSTITUTION", message: "No institution assigned" },
        { status: 403 }
      );
    }

    const history = await listEnrollments(ctx, targetId);
    const active = history.find((e) => e.status === "active") ?? null;
    return NextResponse.json({ active, history });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
