import { createHash } from "crypto";

import { pool } from "@/lib/db";
import { AuthzError, type AuthContext } from "@/lib/authz";

/**
 * Privacy / consent foundation (Milestone 12).
 * Users acknowledge institution-configured notices; versions recorded per user.
 * No legal advice — wording is institutional configuration, not platform law.
 */

export const CONSENT_KINDS = [
  "privacy_notice",
  "data_handling",
  "ai_notice",
  "terms_ack",
] as const;

export type ConsentKind = (typeof CONSENT_KINDS)[number];

export type ConsentRow = {
  id: string;
  user_id: string;
  institution_id: string | null;
  kind: string;
  version: string;
  accepted: boolean;
  accepted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type NoticePayload = {
  privacyNotice: string | null;
  aiNotice: string | null;
  dataHandlingNotice: string | null;
  termsAckText: string | null;
  /** Effective wording: institution override or platform default. */
  effective: Record<ConsentKind, { text: string; version: string; source: "institution" | "default" }>;
};

const PLATFORM_DEFAULTS: Record<ConsentKind, string> = {
  privacy_notice:
    "Campus Skill stores your academic profile, enrollment, submissions, and usage metadata for your institution. Your institution controls who can see this data. Contact your administrator for access or correction requests.",
  data_handling:
    "Academic records are visible only to roles authorized for your institution. Exports are allow-listed and audited. Passwords are handled by the authentication provider — never shown to staff.",
  ai_notice:
    "AI Assist may send limited, authorized context to a configured AI provider. Prompts are not saved in this foundation; usage metadata (feature, tokens, status) may be logged. AI does not assign grades or official decisions.",
  terms_ack:
    "Use Campus Skill only for legitimate academic and placement activity of your institution. Misuse may lead to suspension under your institution's account lifecycle policy.",
};

function defaultVersion(kind: ConsentKind): string {
  return `platform-1-${kind}`;
}

export async function loadNotices(ctx: AuthContext): Promise<NoticePayload> {
  if (!ctx.institutionId) {
    return withDefaults({
      privacyNotice: null,
      aiNotice: null,
      dataHandlingNotice: null,
      termsAckText: null,
    });
  }
  const r = await pool.query<{
    privacy_notice: string | null;
    ai_notice: string | null;
    data_handling_notice: string | null;
    terms_ack_text: string | null;
  }>(
    `SELECT privacy_notice, ai_notice, data_handling_notice, terms_ack_text
       FROM public.institution_configs WHERE institution_id = $1`,
    [ctx.institutionId]
  );
  const row = r.rows[0];
  return withDefaults({
    privacyNotice: row?.privacy_notice ?? null,
    aiNotice: row?.ai_notice ?? null,
    dataHandlingNotice: row?.data_handling_notice ?? null,
    termsAckText: row?.terms_ack_text ?? null,
  });
}

function withDefaults(raw: {
  privacyNotice: string | null;
  aiNotice: string | null;
  dataHandlingNotice: string | null;
  termsAckText: string | null;
}): NoticePayload {
  const pairs: [ConsentKind, string | null][] = [
    ["privacy_notice", raw.privacyNotice],
    ["data_handling", raw.dataHandlingNotice],
    ["ai_notice", raw.aiNotice],
    ["terms_ack", raw.termsAckText],
  ];
  const effective = {} as NoticePayload["effective"];
  for (const [kind, text] of pairs) {
    if (text && text.trim()) {
      effective[kind] = {
        text: text.trim(),
        version: `inst-1-${kind}`,
        source: "institution",
      };
    } else {
      effective[kind] = {
        text: PLATFORM_DEFAULTS[kind],
        version: defaultVersion(kind),
        source: "default",
      };
    }
  }
  return {
    privacyNotice: raw.privacyNotice,
    aiNotice: raw.aiNotice,
    dataHandlingNotice: raw.dataHandlingNotice,
    termsAckText: raw.termsAckText,
    effective,
  };
}

export async function listMyConsents(
  ctx: AuthContext
): Promise<ConsentRow[]> {
  const r = await pool.query<ConsentRow>(
    `SELECT * FROM public.privacy_consents
      WHERE user_id = $1
      ORDER BY kind, version DESC`,
    [ctx.userId]
  );
  return r.rows;
}

export async function acceptConsent(
  ctx: AuthContext,
  kind: ConsentKind,
  version?: string
): Promise<ConsentRow> {
  if (!(CONSENT_KINDS as readonly string[]).includes(kind)) {
    throw new AuthzError("FORBIDDEN", "Unknown consent kind");
  }
  const notices = await loadNotices(ctx);
  const eff = notices.effective[kind];
  const ver = (version && version.trim()) || eff.version;

  // Hash of "userId|kind|ver" — no raw IP stored (privacy-minimizing).
  const ipHash = createHash("sha256")
    .update(`${ctx.userId}|${kind}|${ver}`)
    .digest("hex")
    .slice(0, 32);

  const r = await pool.query<ConsentRow>(
    `INSERT INTO public.privacy_consents
        (user_id, institution_id, kind, version, accepted, accepted_at, ip_hash)
     VALUES ($1,$2,$3,$4,true,now(),$5)
     ON CONFLICT (user_id, kind, version)
     DO UPDATE SET accepted = true, accepted_at = now(), updated_at = now(),
                   ip_hash = EXCLUDED.ip_hash
     RETURNING *`,
    [ctx.userId, ctx.institutionId, kind, ver, ipHash]
  );
  return r.rows[0];
}

export type ConsentStatus = {
  kind: ConsentKind;
  version: string;
  source: "institution" | "default";
  text: string;
  accepted: boolean;
  acceptedAt: Date | null;
};

export async function getConsentStatuses(
  ctx: AuthContext
): Promise<{ notices: NoticePayload; statuses: ConsentStatus[] }> {
  const [notices, rows] = await Promise.all([
    loadNotices(ctx),
    listMyConsents(ctx),
  ]);
  const latest = new Map<string, ConsentRow>();
  for (const row of rows) {
    if (!latest.has(row.kind)) latest.set(row.kind, row);
  }
  const statuses: ConsentStatus[] = CONSENT_KINDS.map((kind) => {
    const eff = notices.effective[kind];
    const row = latest.get(kind);
    const accepted =
      Boolean(row?.accepted) && row?.version === eff.version;
    return {
      kind,
      version: eff.version,
      source: eff.source,
      text: eff.text,
      accepted,
      acceptedAt: accepted ? (row?.accepted_at ?? null) : null,
    };
  });
  return { notices, statuses };
}
