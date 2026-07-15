import { fetchMutation, fetchQuery } from "convex/nextjs";

import { api } from "../../../../../../convex/_generated/api";
import { errorResponse, errorResponseFrom, okWriteResponse } from "@/app/api/_lib/responses";
import { readVerifiedPayment } from "@/app/api/_lib/payment";
import { getToken } from "@/lib/auth-server";
import { getMppx, getPaymentRecordingSecret } from "@/lib/mpp";
import { isMvpPaymentBaseUnits } from "@/lib/tempo";

const MPP_DECIMALS = 6;
const AMOUNT_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

export const canAttemptFundingPayment = (
  rfsStatus: string,
  authorization: string | null,
) => rfsStatus === "open" || /^Payment\s/i.test(authorization ?? "");

export const preventClosedFundingChallenge = (
  rfsStatus: string,
  response: Response,
) => {
  if (rfsStatus !== "open" && response.status === 402) {
    return errorResponse("INVALID_STATE", "RFS can only be funded while open.", 409);
  }

  return response;
};

const parseAmountStringToBaseUnits = (amount: string): bigint | null => {
  const normalized = amount.trim();
  if (!AMOUNT_DECIMAL_PATTERN.test(normalized)) {
    return null;
  }

  const [whole, fractionalRaw = ""] = normalized.split(".");
  if (fractionalRaw.length > MPP_DECIMALS) {
    return null;
  }

  const fractional = fractionalRaw.padEnd(MPP_DECIMALS, "0");
  return BigInt(`${whole}${fractional}`);
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const requestForBody = request.clone();
    const body = (await requestForBody.json()) as { amount?: unknown };
    if (typeof body.amount !== "string") {
      return errorResponse("INVALID_ARGUMENT", "amount must be a decimal string.", 400);
    }

    const amountBaseUnitsFromInput = parseAmountStringToBaseUnits(body.amount);
    if (amountBaseUnitsFromInput === null) {
      return errorResponse("INVALID_ARGUMENT", "amount must be a positive decimal string.", 400);
    }
    if (!isMvpPaymentBaseUnits(amountBaseUnitsFromInput)) {
      return errorResponse(
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
    const rfsDetail = await fetchQuery(api.rfs.get, { rfsId: id }, convexOptions);
    if (
      !canAttemptFundingPayment(
        rfsDetail.rfs.status,
        request.headers.get("Authorization"),
      )
    ) {
      return errorResponse("INVALID_STATE", "RFS can only be funded while open.", 409);
    }
    if (amountBaseUnitsFromInput < rfsDetail.rfs.minimumContributionBaseUnits) {
      return errorResponse(
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
      const result = await fetchMutation(api.contributions.recordContribution, {
        rfsId: id,
        amountBaseUnits: payment.amountBaseUnits,
        currencyAddress: payment.currencyAddress,
        challengeId: payment.challengeId,
        receiptReference: payment.receiptReference,
        ...(payment.principalUserId
          ? { principalUserId: payment.principalUserId }
          : {}),
        serverSecret: getPaymentRecordingSecret(),
      }, convexOptions);

      return okWriteResponse("contribution", result.contributionId, result.rfsNextState);
    });

    const paymentResponse = await paidHandler(request);
    return preventClosedFundingChallenge(rfsDetail.rfs.status, paymentResponse);
  } catch (error) {
    return errorResponseFrom(error);
  }
}
