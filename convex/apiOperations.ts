import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requirePrincipal } from "./lib/principals";

const POLL_INTERVAL_MS = 5_000;

export const createHumanActionOperation = mutation({
  args: { command: v.string(), humanActionId: v.id("humanActionRequests") },
  returns: v.id("apiOperations"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const action = await ctx.db.get(args.humanActionId);
    if (!action || action.ownerPrincipalId !== principal.principalId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Human action not found." });
    }
    const existing = await ctx.db
      .query("apiOperations")
      .withIndex("by_resource", (query) =>
        query.eq("resourceType", "humanAction").eq("resourceId", String(action._id)),
      )
      .filter((query) => query.eq(query.field("principalId"), principal.principalId))
      .first();
    if (existing) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("apiOperations", {
      principalId: principal.principalId,
      command: args.command,
      resourceType: "humanAction",
      resourceId: String(action._id),
      status: "pending",
      progressBps: 0,
      cancellable: false,
      nextPollAt: now + POLL_INTERVAL_MS,
      eventSequence: 1,
      createdAt: now,
    });
  },
});

export const getMine = query({
  args: { operationId: v.id("apiOperations") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const operation = await ctx.db.get(args.operationId);
    if (!operation || operation.principalId !== principal.principalId) return null;
    return operation;
  },
});
