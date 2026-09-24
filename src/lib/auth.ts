import { betterAuth } from "better-auth";
import { PostgresDialect } from "kysely";

import { pool } from "@/lib/db";
import { ensureProfile } from "@/lib/profile";
import { deliverAuthLink } from "@/lib/auth-mail";

/**
 * Auth foundation (Milestone 12):
 * - email + password sign-in (existing)
 * - password reset request + completion (sendResetPassword)
 * - email verification send (emailVerification.sendVerificationEmail)
 * Delivery uses deliverAuthLink (env-configured webhook/SMTP forwarder when
 * present; otherwise logs a server-side dev link — never exposed to other users).
 */
export const auth = betterAuth({
  database: {
    dialect: new PostgresDialect({
      pool,
    }),
    type: "postgres",
    schemaName: "auth",
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url, token }) => {
      await deliverAuthLink({
        kind: "password_reset",
        to: user.email,
        name: user.name,
        url,
        token,
      });
    },
    resetPasswordTokenExpiresIn: 3600,
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await deliverAuthLink({
        kind: "email_verify",
        to: user.email,
        name: user.name,
        url,
        token: null,
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await ensureProfile({
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            image: user.image,
          });
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
