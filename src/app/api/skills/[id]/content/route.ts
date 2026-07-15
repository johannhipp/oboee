import { fetchMutation, fetchQuery } from "convex/nextjs";

import { api } from "../../../../../../convex/_generated/api";
import { errorResponse, errorResponseFrom } from "@/app/api/_lib/responses";
import { readVerifiedPayment } from "@/app/api/_lib/payment";
import { getToken } from "@/lib/auth-server";
import { getMppx, getPaymentRecordingSecret } from "@/lib/mpp";
import { isMvpPaymentBaseUnits } from "@/lib/tempo";

const MPP_DECIMALS = 6;

const formatBaseUnits = (value: bigint) => {
  const scale = BigInt(10) ** BigInt(MPP_DECIMALS);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(MPP_DECIMALS, "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const token = await getToken();
    const convexOptions = token ? { token } : {};
    const viewer = token
      ? await fetchQuery(api.users.getViewer, {}, convexOptions)
      : null;
    const access = await fetchQuery(api.purchases.checkAccess, { skillId: id }, convexOptions);

    if (!access.skill) {
      return errorResponse("NOT_FOUND", "Skill not found.", 404);
    }

    if (access.hasAccess) {
      const entitled = await fetchQuery(
        api.purchases.readEntitledContent,
        { skillId: id },
        convexOptions,
      );
      if (!entitled) {
        return errorResponse("FORBIDDEN", "Skill access could not be verified.", 403);
      }
      return Response.json({
        status: "ok",
        resourceType: "skill",
        resourceId: access.skill._id,
        nextState: access.skill.status,
        accessGranted: true,
        contentMarkdown: entitled.contentMarkdown,
      });
    }

    if (access.skill.status !== "published") {
      return errorResponse("INVALID_STATE", "Skill is not available for purchase.", 409);
    }

    if (!isMvpPaymentBaseUnits(access.skill.purchasePriceBaseUnits)) {
      return errorResponse(
        "INVALID_STATE",
        "This listing is outside the MVP testnet purchase range.",
        409,
      );
    }
    const chargeAmount = formatBaseUnits(access.skill.purchasePriceBaseUnits);
    const paidHandler = getMppx().charge({
      amount: chargeAmount,
      description: `Purchase skill ${id}`,
      ...(viewer ? { externalId: viewer.userId } : {}),
    })(async (paidRequest: Request) => {
      const payment = readVerifiedPayment(paidRequest);
      const purchase = await fetchMutation(api.purchases.recordPurchase, {
        skillId: id,
        amountBaseUnits: payment.amountBaseUnits,
        currencyAddress: payment.currencyAddress,
        challengeId: payment.challengeId,
        receiptReference: payment.receiptReference,
        ...(payment.principalUserId
          ? { principalUserId: payment.principalUserId }
          : {}),
        serverSecret: getPaymentRecordingSecret(),
      }, convexOptions);

      return Response.json({
        status: "ok",
        resourceType: "skill",
        resourceId: access.skill._id,
        nextState: access.skill.status,
        accessGranted: purchase.accessGranted,
        purchaseId: purchase.purchaseId,
        receiptReference: payment.receiptReference,
        contentMarkdown: purchase.contentMarkdown,
      });
    });

    return paidHandler(request);
  } catch (error) {
    return errorResponseFrom(error);
  }
}
