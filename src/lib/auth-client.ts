import { createAuthClient } from "better-auth/react";

/**
 * Browser auth client. Uses same-origin /api/auth by default.
 * Do not put server secrets here.
 */
export const authClient = createAuthClient();
