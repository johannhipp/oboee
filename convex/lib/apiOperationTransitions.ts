import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type TerminalHumanActionStatus = "approved" | "consumed" | "declined" | "expired" | "cancelled";

export const transitionHumanActionOperations = async (
  ctx: MutationCtx,
  actionId: Id<"humanActionRequests">,
  actionStatus: TerminalHumanActionStatus,
  completedAt: number,
) => {
  const operations = await ctx.db
    .query("apiOperations")
    .withIndex("by_resource", (query) =>
      query.eq("resourceType", "humanAction").eq("resourceId", String(actionId)),
    )
    .collect();
  const succeeded = actionStatus === "approved" || actionStatus === "consumed";
  for (const operation of operations) {
    if (operation.status !== "pending" && operation.status !== "running") continue;
    await ctx.db.patch(operation._id, {
      status: succeeded ? "succeeded" : "failed",
      progressBps: 10_000,
      resultResourceId: succeeded ? String(actionId) : undefined,
      errorCode: succeeded ? undefined : `human_action_${actionStatus}`,
      nextPollAt: completedAt,
      eventSequence: operation.eventSequence + 1,
      completedAt,
    });
  }
};
