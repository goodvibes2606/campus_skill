/**
 * Auth link delivery foundation (Milestone 12).
 * No real SMTP required for development:
 * - If AUTH_MAIL_WEBHOOK_URL is set, POSTs a JSON payload (server-only env).
 * - Otherwise logs a structured server line with the full link for local use.
 * Secrets/keys are never returned to API clients — only the mail transport sees them.
 */

export type AuthLinkKind = "password_reset" | "email_verify";

export type AuthLinkMessage = {
  kind: AuthLinkKind;
  to: string;
  name?: string | null;
  url: string;
  token: string | null;
};

function appOrigin(): string {
  const fromEnv = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://localhost:3000";
}

/** Convert Better Auth internal URL into an app-facing URL when possible. */
function toAppUrl(url: string): string {
  try {
    const u = new URL(url, appOrigin());
    // Prefer a single origin the user can open.
    return u.toString();
  } catch {
    return url;
  }
}

export async function deliverAuthLink(msg: AuthLinkMessage): Promise<void> {
  const link = toAppUrl(msg.url);
  const webhook = process.env.AUTH_MAIL_WEBHOOK_URL;

  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: msg.kind,
          to: msg.to,
          name: msg.name ?? null,
          link,
          subject:
            msg.kind === "password_reset"
              ? "Reset your Campus Skill password"
              : "Verify your Campus Skill email",
        }),
      });
      if (!res.ok) {
        // Fall through to console delivery so the user is not stranded.
        console.warn(`[auth-mail] webhook status ${res.status}; falling back to log`);
        logLink(msg, link);
      }
    } catch (err) {
      console.warn(
        `[auth-mail] webhook failed: ${err instanceof Error ? err.message : "error"}; falling back to log`
      );
      logLink(msg, link);
    }
    return;
  }

  logLink(msg, link);
}

function logLink(msg: AuthLinkMessage, link: string): void {
  // Server log only — not sent to the browser response body.
  console.info(
    JSON.stringify({
      event: "auth_link",
      kind: msg.kind,
      to: msg.to,
      link,
      at: new Date().toISOString(),
    })
  );
}
