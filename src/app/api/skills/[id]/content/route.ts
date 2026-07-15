import { fetchMutation, fetchQuery } from "convex/nextjs";

import { api } from "../../../../../../convex/_generated/api";
import { ok, problem, responseFromError } from "@/lib/api/http";
import { readVerifiedPayment } from "@/lib/api/payment";
import { getToken } from "@/lib/auth-server";
import { getMppx } from "@/lib/mpp";
import { createSignedPaymentServerCommand } from "@/lib/server-command";
import { isMvpPaymentBaseUnits } from "@/lib/tempo";
import { formatTokenBaseUnits } from "../../../../../../shared/domain/money";

export async function GET(
  request: Request,
  context: RouteContext<"/api/skills/[id]/content">,
) {
  try {
    const { id } = await context.params;
    const token = await getToken();
    const convexOptions = token ? { token } : {};
    const viewer = token
      ? await fetchQuery(api.users.getViewer, {}, convexOptions)
      : null;
    const access = await fetchQuery(api.purchases.checkAccess, { skillId: id }, convexOptions);

    if (!access.skill) {
      return problem("NOT_FOUND", "Skill not found.", 404);
    }

    if (access.hasAccess) {
      const entitled = await fetchQuery(
        api.purchases.readEntitledContent,
        { skillId: id },
        convexOptions,
      );
      if (!entitled) {
        return problem("FORBIDDEN", "Skill access could not be verified.", 403);
      }
      return ok({
        resourceType: "skill",
        resourceId: access.skill._id,
        nextState: access.skill.status,
        accessGranted: true,
        contentMarkdown: entitled.contentMarkdown,
      });
    }

    if (access.skill.status !== "published") {
      return problem("INVALID_STATE", "Skill is not available for purchase.", 409);
    }

    if (!isMvpPaymentBaseUnits(access.skill.purchasePriceBaseUnits)) {
      return problem(
        "INVALID_STATE",
        "This listing is outside the MVP testnet purchase range.",
        409,
      );
    }
    const chargeAmount = formatTokenBaseUnits(
      access.skill.purchasePriceBaseUnits,
      { minimumFractionDigits: 0 },
    );
    const paidHandler = getMppx().charge({
      amount: chargeAmount,
      description: `Purchase skill ${id}`,
      ...(viewer ? { externalId: viewer.userId } : {}),
    })(async (paidRequest: Request) => {
      const payment = readVerifiedPayment(paidRequest);
      const envelope = await createSignedPaymentServerCommand({
        operation: "purchase",
        resourceId: id,
        amountBaseUnits: payment.amountBaseUnits,
        currencyAddress: payment.currencyAddress,
        challengeId: payment.challengeId,
        receiptReference: payment.receiptReference,
        ...(payment.principalUserId
          ? { principalUserId: payment.principalUserId }
          : {}),
      });
      const purchase = await fetchMutation(
        api.paymentIngress.record,
        envelope,
        convexOptions,
      );
      if (purchase.operation !== "purchase") {
        throw new Error("Payment ingress returned the wrong operation.");
      }

      return ok({
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
    return responseFromError(error);
  }
}
