import { NextResponse } from "next/server";

import { AuthzError, getAuthContext, ROLES } from "@/lib/authz";
import { assertCanAssignFaculty, getAcademicScope } from "@/lib/academic-scope";
import {
  assignFaculty,
  endFacultyAssignment,
  getActiveFacultyAssignments,
  listFacultyAssignments,
} from "@/lib/faculty-assignment";

/**
 * POST — assign faculty to a subject in a section (HOD/admin scoped).
 * Body: {
 *   action?: 'assign' | 'end',
 *   facultyId, sectionId, subjectId  — for assign
 *   assignmentId, status             — for end
 * }
 *
 * GET ?facultyId= — assignment history (own faculty, or HOD/admin).
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const body = (await request.json()) as {
      action?: "assign" | "end";
      facultyId?: string;
      sectionId?: string;
      subjectId?: string;
      assignmentId?: string;
      status?: "ended" | "transferred";
    };

    if (body.action === "end") {
      if (!body.assignmentId || !body.status) {
        return NextResponse.json(
          { error: "assignmentId and status are required to end assignment" },
          { status: 400 }
        );
      }
      const ended = await endFacultyAssignment(
        ctx,
        body.assignmentId,
        body.status
      );
      return NextResponse.json({
        id: ended.id,
        status: ended.status,
        endedAt: ended.ended_at,
        sectionId: ended.section_id,
        subjectId: ended.subject_id,
      });
    }

    if (!body.facultyId || !body.sectionId || !body.subjectId) {
      return NextResponse.json(
        { error: "facultyId, sectionId, and subjectId are required" },
        { status: 400 }
      );
    }

    await assertCanAssignFaculty(ctx, {
      sectionId: body.sectionId,
      subjectId: body.subjectId,
    });

    const assignment = await assignFaculty(ctx, {
      facultyId: body.facultyId,
      sectionId: body.sectionId,
      subjectId: body.subjectId,
    });

    return NextResponse.json({
      id: assignment.id,
      status: assignment.status,
      facultyId: assignment.faculty_id,
      sectionId: assignment.section_id,
      subjectId: assignment.subject_id,
      subjectCode: assignment.subject_code,
      subjectName: assignment.subject_name,
      departmentCode: assignment.department_code,
      programCode: assignment.program_code,
      academicYear: assignment.academic_year_name,
      semesterNumber: assignment.semester_number,
      sectionName: assignment.section_name,
      assignedAt: assignment.assigned_at,
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
    const facultyId = searchParams.get("facultyId");
    const targetId = facultyId ?? ctx.userId;

    if (targetId !== ctx.userId && ctx.roleName === ROLES.faculty) {
      return NextResponse.json(
        {
          error: "FORBIDDEN",
          message: "Faculty may only read own assignments",
        },
        { status: 403 }
      );
    }

    if (targetId === ctx.userId) {
      const scope = await getAcademicScope(ctx);
      const history = await listFacultyAssignments(ctx, ctx.userId);
      return NextResponse.json({
        active: scope.facultyAssignments,
        history,
      });
    }

    // HOD/admin reading another faculty — institution-scoped
    const active = await getActiveFacultyAssignments(targetId);
    const history = await listFacultyAssignments(ctx, targetId);
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
