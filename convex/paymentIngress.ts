import { ConvexError, v } from "convex/values";

import { mutation } from "./_generated/server";
import { authComponent } from "./auth";
import { applyContributionPayment } from "./contributions";
import { resolveVerifiedPaymentPrincipal } from "./lib/paymentBoundary";
import { verifyPaymentServerCommand } from "./lib/serverCommand";
import { rfsStatusValidator } from "./lib/validators";
import { applyPurchasePayment } from "./purchases";

const paymentCommandValidator = v.object({
  operation: v.union(v.literal("fund"), v.literal("purchase")),
  resourceId: v.string(),
  amountBaseUnits: v.string(),
  currencyAddress: v.string(),
  challengeId: v.string(),
  receiptReference: v.string(),
  principalUserId: v.optional(v.string()),
  issuedAt: v.number(),
  expiresAt: v.number(),
  nonce: v.string(),
});

export const record = mutation({
  args: {
    command: paymentCommandValidator,
    signature: v.string(),
  },
  returns: v.union(
    v.object({
      operation: v.literal("fund"),
      contributionId: v.id("contributions"),
      rfsNextState: rfsStatusValidator,
    }),
    v.object({
      operation: v.literal("purchase"),
      purchaseId: v.id("purchases"),
      accessGranted: v.boolean(),
      contentMarkdown: v.string(),
    }),
  ),
  handler: async (ctx, { command, signature }) => {
    await verifyPaymentServerCommand(command, signature);

    const authenticatedUser = await authComponent.safeGetAuthUser(ctx);
    const principal = resolveVerifiedPaymentPrincipal(
      authenticatedUser?._id,
      command.principalUserId,
      command.challengeId,
    );
    const amountBaseUnits = BigInt(command.amountBaseUnits);

    switch (command.operation) {
      case "fund": {
        const result = await applyContributionPayment(
          ctx,
          {
            rfsId: command.resourceId,
            amountBaseUnits,
            currencyAddress: command.currencyAddress,
            challengeId: command.challengeId,
            receiptReference: command.receiptReference,
          },
          principal,
        );
        return { operation: "fund" as const, ...result };
      }
      case "purchase": {
        const result = await applyPurchasePayment(
          ctx,
          {
            skillId: command.resourceId,
            amountBaseUnits,
            currencyAddress: command.currencyAddress,
            challengeId: command.challengeId,
            receiptReference: command.receiptReference,
          },
          principal,
        );
        return { operation: "purchase" as const, ...result };
      }
      default: {
        command.operation satisfies never;
        throw new ConvexError({
          code: "INVALID_COMMAND",
          message: "Unsupported payment operation.",
        });
      }
    }
  },
});
