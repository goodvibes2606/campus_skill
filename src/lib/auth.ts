import { betterAuth } from "better-auth";
import { PostgresDialect } from "kysely";

import { pool } from "@/lib/db";
import { ensureProfile } from "@/lib/profile";

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
