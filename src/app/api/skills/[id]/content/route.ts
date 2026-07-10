import { Credential } from "mppx";
import { fetchMutation, fetchQuery } from "convex/nextjs";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { errorResponse, errorResponseFrom } from "@/app/api/_lib/responses";
import { getMppx } from "@/lib/mpp";
import { moneyWritesDisabledResponse } from "@/lib/operational-gates";

const MPP_DECIMALS = 6;
const MAX_TEST_AMOUNT_BASE_UNITS = BigInt(9_000);

const formatBaseUnits = (value: bigint) => {
  const scale = BigInt(10) ** BigInt(MPP_DECIMALS);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(MPP_DECIMALS, "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const skillId = id as Id<"skills">;
    const access = await fetchQuery(api.purchases.checkAccess, { skillId });

    if (!access.skill) {
      return errorResponse("NOT_FOUND", "Skill not found.", 404);
    }

    if (access.hasAccess) {
      return Response.json({
        status: "ok",
        resourceType: "skill",
        resourceId: access.skill._id,
        nextState: access.skill.status,
        accessGranted: true,
        contentMarkdown: access.skill.contentMarkdown,
        skillVersion: access.skillVersion?.version,
        contentHash: access.skillVersion?.contentHash,
        evaluationDeadline: access.skillVersion?.evaluationDeadline,
      });
    }

    if (access.skill.status !== "published") {
      return errorResponse("INVALID_STATE", "Skill is not available for purchase.", 409);
    }

    const disabledResponse = moneyWritesDisabledResponse();
    if (disabledResponse) {
      return disabledResponse;
    }

    const chargeAmount = formatBaseUnits(
      access.skill.purchasePriceBaseUnits > MAX_TEST_AMOUNT_BASE_UNITS
        ? MAX_TEST_AMOUNT_BASE_UNITS
        : access.skill.purchasePriceBaseUnits,
    );
    const paidHandler = getMppx().charge({ amount: chargeAmount })(async (paidRequest: Request) => {
      const credential = Credential.fromRequest(paidRequest);
      const challengeRequest = credential.challenge.request as {
        amount?: unknown;
        currency?: unknown;
      };

      const challengeAmount = challengeRequest.amount;
      if (typeof challengeAmount !== "string" || !/^\d+$/.test(challengeAmount)) {
        return errorResponse(
          "INVALID_CHALLENGE",
          "Paid credential did not include a valid amount.",
          400,
        );
      }

      const currencyAddressRaw = challengeRequest.currency;
      if (typeof currencyAddressRaw !== "string") {
        return errorResponse("INVALID_CHALLENGE", "Paid credential did not include a currency.", 400);
      }

      const rawPayload = credential.payload as {
        type?: unknown;
        hash?: unknown;
        signature?: unknown;
      };
      const payloadReceiptReference =
        rawPayload.type === "hash" && typeof rawPayload.hash === "string"
          ? rawPayload.hash
          : rawPayload.type === "transaction" && typeof rawPayload.signature === "string"
            ? rawPayload.signature
            : null;

      const purchase = await fetchMutation(api.purchases.recordPurchase, {
        skillId,
        amountBaseUnits: BigInt(challengeAmount),
        currencyAddress: currencyAddressRaw,
        challengeId: credential.challenge.id,
        receiptReference: payloadReceiptReference ?? credential.challenge.id,
      });

      const refreshed = await fetchQuery(api.purchases.checkAccess, { skillId });
      if (!refreshed.skill) {
        return errorResponse("NOT_FOUND", "Skill not found.", 404);
      }

      return Response.json({
        status: "ok",
        resourceType: "skill",
        resourceId: refreshed.skill._id,
        nextState: refreshed.skill.status,
        accessGranted: purchase.accessGranted,
        purchaseId: purchase.purchaseId,
        receiptReference: payloadReceiptReference ?? credential.challenge.id,
        contentMarkdown: refreshed.skill.contentMarkdown,
        skillVersion: refreshed.skillVersion?.version,
        contentHash: refreshed.skillVersion?.contentHash,
        evaluationDeadline: refreshed.skillVersion?.evaluationDeadline,
      });
    });

    return paidHandler(request);
  } catch (error) {
    return errorResponseFrom(error);
  }
}
