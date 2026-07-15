import { ConvexError } from "convex/values";

import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";

export const requireAuthedUser = async (ctx: MutationCtx | QueryCtx) => {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }
  return user;
};

export const requireAuthedUserId = async (ctx: MutationCtx | QueryCtx) =>
  (await requireAuthedUser(ctx))._id;
