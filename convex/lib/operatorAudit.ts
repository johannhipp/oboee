import { sha256Digest } from "./contracts";
import type { MutationCtx } from "../_generated/server";

export const recordOperatorAudit = async (
  ctx: MutationCtx,
  args: {
    actorPrincipalId: string;
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    result?: "completed" | "denied" | "failed";
    metadata?: unknown;
  },
) => await ctx.db.insert("operatorAuditEvents", {
  actorPrincipalId: args.actorPrincipalId,
  action: args.action,
  targetType: args.targetType,
  targetId: args.targetId,
  reason: args.reason.trim(),
  requestDigest: sha256Digest({
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    reason: args.reason.trim(),
    metadata: args.metadata ?? null,
  }),
  result: args.result ?? "completed",
  metadataJson: JSON.stringify(args.metadata ?? {}),
  occurredAt: Date.now(),
});
