import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";

import authConfig from "./auth.config";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authSchema from "./betterAuth/schema";

export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  local: { schema: authSchema },
});

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const trustedOrigins = [
    siteUrl,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter((value): value is string => Boolean(value));

  return {
    database: authComponent.adapter(ctx),
    ...(siteUrl ? { baseURL: siteUrl } : {}),
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      passkey(),
      apiKey({
        enableSessionForAPIKeys: true,
        keyExpiration: {
          defaultExpiresIn: 90 * 24 * 60 * 60 * 1_000,
          minExpiresIn: 1,
          maxExpiresIn: 365,
        },
        rateLimit: {
          enabled: true,
          timeWindow: 60 * 1_000,
          maxRequests: 120,
        },
        permissions: {
          defaultPermissions: {
            rfs: ["read"],
            skills: ["read"],
            settlement: ["read"],
          },
        },
      }),
      convex({
        authConfig,
        jwt: { expirationSeconds: 60 },
      }),
    ],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));
