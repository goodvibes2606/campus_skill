import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/authz";
import { mapApiError, unauthenticated } from "@/lib/api-errors";
import {
  acceptConsent,
  getConsentStatuses,
  loadNotices,
  type ConsentKind,
} from "@/lib/privacy";

/**
 * GET  /api/privacy — notices + caller's consent statuses.
 * POST /api/privacy — { kind, version? } acknowledge a notice.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const { notices, statuses } = await getConsentStatuses(ctx);
    return NextResponse.json({
      effective: notices.effective,
      statuses,
      institutionConfigured: {
        privacyNotice: notices.privacyNotice !== null,
        aiNotice: notices.aiNotice !== null,
        dataHandlingNotice: notices.dataHandlingNotice !== null,
        termsAckText: notices.termsAckText !== null,
      },
    });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthenticated();
    const body = (await request.json()) as { kind?: string; version?: string };
    if (!body.kind) {
      return NextResponse.json(
        { error: "VALIDATION", message: "kind is required" },
        { status: 400 }
      );
    }
    const row = await acceptConsent(
      ctx,
      body.kind as ConsentKind,
      body.version
    );
    return NextResponse.json({
      consent: {
        kind: row.kind,
        version: row.version,
        accepted: row.accepted,
        acceptedAt: row.accepted_at,
      },
    });
  } catch (error) {
    return mapApiError(error);
  }
}
