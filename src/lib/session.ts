import { cache } from "react";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";

/**
 * Server-side session lookup (authoritative — hits Better Auth / DB).
 * Memoized per request render pass.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({
    headers: await headers(),
  });
});

/**
 * Returns the authenticated user, bootstrapping public.profiles on
 * first login (and on any login where the profile row is missing).
 */
export async function getSessionUser() {
  const session = await getSession();
  if (!session?.user) return null;

  await ensureProfile({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    image: session.user.image,
  });

  return session.user;
}
