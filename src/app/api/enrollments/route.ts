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
        message: error instanceof Error ? error.message : "unknown",
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

    // Student may always read own enrollment; others need institution match
    const targetId = studentId ?? ctx.userId;
    if (targetId !== ctx.userId && ctx.roleName === ROLES.student) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Students may only read own enrollment" },
        { status: 403 }
      );
    }

    if (targetId === ctx.userId && ctx.roleName === ROLES.student) {
      const active = await getActiveEnrollment(ctx.userId);
      const history = await listEnrollments(ctx, ctx.userId);
      return NextResponse.json({
        active,
        history,
      });
    }

    // faculty/admin/HOD reading another student — institution-scoped
    const history = await listEnrollments(ctx, targetId);
    const active =
      history.find((e) => e.status === "active") ?? null;
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
