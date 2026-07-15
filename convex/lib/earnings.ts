import { ConvexError } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { splitPlatformFee } from "../../shared/domain/money";
import type { EarningSourceKind } from "../../shared/domain/status";

type EarningInput = {
  sourceKey: string;
  rfsId: Id<"rfs">;
  researcherUserId: string;
  sourceKind: EarningSourceKind;
  purchaseId?: Id<"purchases">;
  grossAmountBaseUnits: bigint;
  currencyAddress: string;
};

export const recordEarning = async (ctx: MutationCtx, input: EarningInput) => {
  const currencyAddress = input.currencyAddress.trim().toLowerCase();
  const { platformFeeBaseUnits, netAmountBaseUnits } = splitPlatformFee(
    input.grossAmountBaseUnits,
  );
  const existing = await ctx.db
    .query("earningEntries")
    .withIndex("by_source_key", (query) =>
      query.eq("sourceKey", input.sourceKey),
    )
    .unique();

  if (existing) {
    if (
      existing.rfsId !== input.rfsId ||
      existing.researcherUserId !== input.researcherUserId ||
      existing.sourceKind !== input.sourceKind ||
      existing.purchaseId !== input.purchaseId ||
      existing.grossAmountBaseUnits !== input.grossAmountBaseUnits ||
      existing.platformFeeBaseUnits !== platformFeeBaseUnits ||
      existing.netAmountBaseUnits !== netAmountBaseUnits ||
      existing.currencyAddress !== currencyAddress
    ) {
      throw new ConvexError({
        code: "IDEMPOTENCY_CONFLICT",
        message: "The earning source was already recorded with different facts.",
      });
    }
    return existing._id;
  }

  if (input.grossAmountBaseUnits < BigInt(0)) {
    throw new ConvexError({
      code: "INVALID_AMOUNT",
      message: "Earning amounts cannot be negative.",
    });
  }

  return ctx.db.insert("earningEntries", {
    sourceKey: input.sourceKey,
    rfsId: input.rfsId,
    researcherUserId: input.researcherUserId,
    sourceKind: input.sourceKind,
    ...(input.purchaseId ? { purchaseId: input.purchaseId } : {}),
    grossAmountBaseUnits: input.grossAmountBaseUnits,
    platformFeeBaseUnits,
    netAmountBaseUnits,
    currencyAddress,
  });
};
