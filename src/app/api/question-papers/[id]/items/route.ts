import { NextResponse } from "next/server";

import { AuthzError, getAuthContext } from "@/lib/authz";
import { listPaperItems, addPaperItem } from "@/lib/question-bank";
import { AssessmentValidationError } from "@/lib/assessment-types";

/**
 * GET  /api/question-papers/[id]/items — ordered questions on a paper.
 * POST /api/question-papers/[id]/items — add question (owner/HOD/admin;
 *      blocked when paper is published/archived). Snapshots bank text.
 *
 * Body (POST): { questionBankItemId?, questionText?, marks? }
 */
export async function GET(
  _request: Request,
  routeCtx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await routeCtx.params;
    const items = await listPaperItems(auth, id);
    return NextResponse.json({
      count: items.length,
      items: items.map((i) => ({
        id: i.id,
        paperId: i.paper_id,
        orderNumber: i.order_number,
        questionBankItemId: i.question_bank_item_id,
        questionTextSnapshot: i.question_text_snapshot,
        marks: i.marks,
        createdAt: i.created_at,
      })),
    });
  } catch (error) {
    return handleErr(error);
  }
}

export async function POST(
  request: Request,
  routeCtx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await routeCtx.params;
    const body = await request.json();
    const item = await addPaperItem(auth, id, {
      questionBankItemId: body.questionBankItemId || null,
      questionText: body.questionText,
      marks: body.marks,
    });
    return NextResponse.json(
      {
        item: {
          id: item.id,
          paperId: item.paper_id,
          orderNumber: item.order_number,
          questionBankItemId: item.question_bank_item_id,
          questionTextSnapshot: item.question_text_snapshot,
          marks: item.marks,
          createdAt: item.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleErr(error);
  }
}

function handleErr(error: unknown) {
  if (error instanceof AssessmentValidationError) {
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
