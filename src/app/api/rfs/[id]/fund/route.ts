import { fetchMutation, fetchQuery } from "convex/nextjs";

import { api } from "../../../../../../convex/_generated/api";
import { problem, responseFromError, okWrite } from "@/lib/api/http";
import { parseFundRequest } from "@/lib/api/parsers";
import { readVerifiedPayment } from "@/lib/api/payment";
import { getToken } from "@/lib/auth-server";
import { getMppx } from "@/lib/mpp";
import { createSignedPaymentServerCommand } from "@/lib/server-command";
import { isMvpPaymentBaseUnits } from "@/lib/tempo";

export const canAttemptFundingPayment = (
  rfsStatus: string,
  authorization: string | null,
) => rfsStatus === "open" || /^Payment\s/i.test(authorization ?? "");

export const preventClosedFundingChallenge = (
  rfsStatus: string,
  response: Response,
) => {
  if (rfsStatus !== "open" && response.status === 402) {
    return problem("INVALID_STATE", "RFS can only be funded while open.", 409);
  }

  return response;
};

export async function POST(
  request: Request,
  context: RouteContext<"/api/rfs/[id]/fund">,
) {
  try {
    const body = await parseFundRequest(request.clone());
    if (!isMvpPaymentBaseUnits(body.amountBaseUnits)) {
      return problem(
        "INVALID_ARGUMENT",
        "For MVP testing, amount must be 1..9000 base units.",
        400,
      );
    }

    const { id } = await context.params;
    const token = await getToken();
    const convexOptions = token ? { token } : {};
    const viewer = token
      ? await fetchQuery(api.users.getViewer, {}, convexOptions)
      : null;
    const rfsDetail = await fetchQuery(
      api.rfs.getPublic,
      { rfsId: id },
      convexOptions,
    );
    if (
      !canAttemptFundingPayment(
        rfsDetail.rfs.status,
        request.headers.get("Authorization"),
      )
    ) {
      return problem("INVALID_STATE", "RFS can only be funded while open.", 409);
    }
    if (body.amountBaseUnits < rfsDetail.rfs.minimumContributionBaseUnits) {
      return problem(
        "INVALID_AMOUNT",
        "Contribution amount is below the minimum contribution.",
        400,
      );
    }

    const paidHandler = getMppx().charge({
      amount: body.amount,
      description: `Fund RFS ${id}`,
      ...(viewer ? { externalId: viewer.userId } : {}),
    })(async (paidRequest: Request) => {
      const payment = readVerifiedPayment(paidRequest);
      const envelope = await createSignedPaymentServerCommand({
        operation: "fund",
        resourceId: id,
        amountBaseUnits: payment.amountBaseUnits,
        currencyAddress: payment.currencyAddress,
        challengeId: payment.challengeId,
        receiptReference: payment.receiptReference,
        ...(payment.principalUserId
          ? { principalUserId: payment.principalUserId }
          : {}),
      });
      const result = await fetchMutation(
        api.paymentIngress.record,
        envelope,
        convexOptions,
      );
      if (result.operation !== "fund") {
        throw new Error("Payment ingress returned the wrong operation.");
      }

      return okWrite("contribution", result.contributionId, result.rfsNextState);
    });

    const paymentResponse = await paidHandler(request);
    return preventClosedFundingChallenge(rfsDetail.rfs.status, paymentResponse);
  } catch (error) {
    return responseFromError(error);
  }
}
