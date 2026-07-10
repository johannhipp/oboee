import { ConvexError, v } from "convex/values";

import { mutation, type MutationCtx } from "./_generated/server";
import { requirePrincipal } from "./lib/principals";

const DAY_MS = 24 * 60 * 60 * 1_000;
const RATE_WINDOW_MS = 60 * 1_000;

const consume = async (ctx: MutationCtx, principalId: string, action: string, limit: number) => {
  const now = Date.now();
  const windowStartedAt = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  const existing = await ctx.db.query("apiRateLimits").withIndex("by_principal_action_window", (query) => query.eq("principalId", principalId).eq("action", action).eq("windowStartedAt", windowStartedAt)).unique();
  const count = (existing?.count ?? 0) + 1;
  if (count > limit) throw new ConvexError({ code: "RATE_LIMITED", message: "Request rate exceeded; retry after the current minute window." });
  if (existing) await ctx.db.patch(existing._id, { count });
  else await ctx.db.insert("apiRateLimits", { principalId, action, windowStartedAt, count, expiresAt: windowStartedAt + 2 * RATE_WINDOW_MS });
  return { limit, remaining: Math.max(0, limit - count), resetAt: windowStartedAt + RATE_WINDOW_MS };
};

export const consumeRateLimit = mutation({
  args: { action: v.string(), limit: v.optional(v.number()) },
  returns: v.object({ limit: v.number(), remaining: v.number(), resetAt: v.number() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const limit = Math.max(1, Math.min(1_000, args.limit ?? 120));
    return await consume(ctx, principal.principalId, args.action, limit);
  },
});

export const beginCommand = mutation({
  args: { action: v.string(), idempotencyKey: v.string(), requestDigest: v.string() },
  returns: v.object({ recordId: v.id("idempotencyRecords"), replay: v.boolean(), resultJson: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    await consume(ctx, principal.principalId, `command:${args.action}`, 30);
    const existing = await ctx.db.query("idempotencyRecords").withIndex("by_principal_action_and_key", (query) => query.eq("principalId", principal.principalId).eq("action", args.action).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing) {
      if (existing.requestDigest !== args.requestDigest) throw new ConvexError({ code: "IDEMPOTENCY_CONFLICT", message: "Idempotency key was used with a different payload." });
      if (existing.state === "completed" && existing.resultJson) return { recordId: existing._id, replay: true, resultJson: existing.resultJson };
      if (existing.state === "pending") throw new ConvexError({ code: "COMMAND_IN_PROGRESS", message: "The idempotent command is still in progress." });
      await ctx.db.patch(existing._id, { state: "pending", errorCode: undefined });
      return { recordId: existing._id, replay: false };
    }
    const recordId = await ctx.db.insert("idempotencyRecords", {
      principalId: principal.principalId, apiVersion: "v2", action: args.action,
      idempotencyKey: args.idempotencyKey, requestDigest: args.requestDigest,
      state: "pending", expiresAt: Date.now() + DAY_MS, createdAt: Date.now(),
    });
    return { recordId, replay: false };
  },
});

export const completeCommand = mutation({
  args: { recordId: v.id("idempotencyRecords"), requestDigest: v.string(), resultJson: v.string(), resultResourceType: v.optional(v.string()), resultResourceId: v.optional(v.string()) },
  returns: v.literal("completed"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const record = await ctx.db.get(args.recordId);
    if (!record || record.principalId !== principal.principalId || record.requestDigest !== args.requestDigest) throw new ConvexError({ code: "IDEMPOTENCY_CONFLICT", message: "Idempotency reservation does not match the command." });
    if (record.state === "completed") {
      if (record.resultJson !== args.resultJson) throw new ConvexError({ code: "IDEMPOTENCY_CONFLICT", message: "Completed command result cannot be changed." });
      return "completed" as const;
    }
    await ctx.db.patch(record._id, { state: "completed", resultJson: args.resultJson, resultResourceType: args.resultResourceType, resultResourceId: args.resultResourceId });
    const prior = await ctx.db.query("activityEvents").withIndex("by_principal_and_sequence", (query) => query.eq("principalId", principal.principalId)).order("desc").first();
    await ctx.db.insert("activityEvents", {
      principalId: principal.principalId,
      role: "actor",
      resourceType: args.resultResourceType ?? "command",
      resourceId: args.resultResourceId ?? String(record._id),
      eventType: record.action,
      publicSummary: `Completed ${record.action.split(":", 1)[0].replaceAll("_", " ")}.`,
      capabilityReference: args.resultResourceType && args.resultResourceId ? `${args.resultResourceType}:${args.resultResourceId}` : undefined,
      sequence: (prior?.sequence ?? 0) + 1,
      occurredAt: Date.now(),
    });
    return "completed" as const;
  },
});

export const failCommand = mutation({
  args: { recordId: v.id("idempotencyRecords"), requestDigest: v.string(), errorCode: v.string() },
  returns: v.literal("failed"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const record = await ctx.db.get(args.recordId);
    if (!record || record.principalId !== principal.principalId || record.requestDigest !== args.requestDigest || record.state === "completed") throw new ConvexError({ code: "IDEMPOTENCY_CONFLICT", message: "Idempotency reservation cannot be failed." });
    await ctx.db.patch(record._id, { state: "failed", errorCode: args.errorCode });
    return "failed" as const;
  },
});
