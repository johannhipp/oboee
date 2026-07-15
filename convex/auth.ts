import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth/minimal";

import authConfig from "./auth.config";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const trustedOrigins = [
    siteUrl,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter((value): value is string => Boolean(value));

  const options = {
    database: authComponent.adapter(ctx),
    ...(siteUrl ? { baseURL: siteUrl } : {}),
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      passkey(),
      convex({
        authConfig,
      }),
    ],
  };

  return betterAuth(options);
};
