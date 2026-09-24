import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/authz";
import { mapApiError, unauthenticated } from "@/lib/api-errors";
import {
  filterHelpArticles,
  getHelpArticle,
  helpModulesForRole,
} from "@/lib/help-kb";

/**
 * GET /api/help — role-filtered help articles.
 * Query: ?module=&q=&id=
 * Public for signed-in users only (session required via getAuthContext).
 * Structured for future AI retrieval (stable ids, roles, tags).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (id) {
      const article = getHelpArticle(id, ctx.roleName);
      if (!article) {
        return NextResponse.json(
          { error: "not_found", message: "Help article not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ article });
    }
    const articles = filterHelpArticles({
      roleName: ctx.roleName,
      module: searchParams.get("module"),
      q: searchParams.get("q"),
    });
    return NextResponse.json({
      role: ctx.roleName,
      modules: helpModulesForRole(ctx.roleName),
      count: articles.length,
      articles: articles.map((a) => ({
        id: a.id,
        title: a.title,
        summary: a.summary,
        module: a.module,
        tags: a.tags,
        relatedIds: a.relatedIds ?? [],
      })),
    });
  } catch (error) {
    return mapApiError(error);
  }
}

/** GET with ?id= and ?detail=1 returns full body via list above — also allow body fetch. */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const body = (await request.json()) as { id?: string };
    if (!body.id) {
      return NextResponse.json(
        { error: "VALIDATION", message: "id is required" },
        { status: 400 }
      );
    }
    const article = getHelpArticle(body.id, ctx.roleName);
    if (!article) {
      return NextResponse.json(
        { error: "not_found", message: "Help article not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ article });
  } catch (error) {
    return mapApiError(error);
  }
}
