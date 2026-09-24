import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "better-auth.session_token";

/**
 * Entry pages: signed-in users are bounced home (sign-in / sign-up only).
 * Recovery + verification + public directory stay reachable without a session
 * (email links open logged-out or logged-in — both must work).
 */
const AUTH_ENTRY_PREFIXES = ["/sign-in", "/sign-up"];
const PUBLIC_ALWAYS_PREFIXES = [
  "/public",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

function matches(prefixes: string[], pathname: string): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Optimistic session check only (cookie presence) — no DB calls here.
 * Authoritative session validation happens in server components via
 * auth.api.getSession (src/lib/session.ts).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (matches(PUBLIC_ALWAYS_PREFIXES, pathname)) {
    return NextResponse.next();
  }

  if (matches(AUTH_ENTRY_PREFIXES, pathname)) {
    if (hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const signIn = new URL("/sign-in", request.url);
    if (pathname !== "/") {
      signIn.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
