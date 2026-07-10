import { Credential } from "mppx";
import { fetchMutation, fetchQuery } from "convex/nextjs";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { errorResponse, errorResponseFrom, okWriteResponse } from "@/app/api/_lib/responses";
import { getMppx } from "@/lib/mpp";
import { moneyWritesDisabledResponse } from "@/lib/operational-gates";

const MPP_DECIMALS = 6;
const AMOUNT_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const MAX_TEST_AMOUNT_BASE_UNITS = BigInt(9_000);

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
  const disabledResponse = moneyWritesDisabledResponse();
  if (disabledResponse) {
    return disabledResponse;
  }

  try {
    const requestForBody = request.clone();
    const body = (await requestForBody.json()) as { amount?: unknown };
    if (typeof body.amount !== "string") {
      return errorResponse("INVALID_ARGUMENT", "amount must be a decimal string.", 400);
    }

    const amountBaseUnitsFromInput = parseAmountStringToBaseUnits(body.amount);
    if (amountBaseUnitsFromInput === null || amountBaseUnitsFromInput < BigInt(1)) {
      return errorResponse("INVALID_ARGUMENT", "amount must be a positive decimal string.", 400);
    }
    if (amountBaseUnitsFromInput > MAX_TEST_AMOUNT_BASE_UNITS) {
      return errorResponse(
        "INVALID_ARGUMENT",
        "For MVP testing, amount must be below $0.01.",
        400,
      );
    }

    const { id } = await context.params;
    const rfsId = id as Id<"rfs">;
    const rfsDetail = await fetchQuery(api.rfs.get, { rfsId });
    if (!rfsDetail.canFund || rfsDetail.rfs.status !== "open") {
      return errorResponse("INVALID_STATE", "RFS can only be funded while open.", 409);
    }
    if (amountBaseUnitsFromInput < rfsDetail.rfs.minimumContributionBaseUnits) {
      return errorResponse(
        "INVALID_AMOUNT",
        "Contribution amount is below the minimum contribution.",
        400,
      );
    }

    const paidHandler = getMppx().charge({ amount: body.amount })(async (paidRequest: Request) => {
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

      const result = await fetchMutation(api.contributions.recordContribution, {
        rfsId,
        amountBaseUnits: BigInt(challengeAmount),
        currencyAddress: currencyAddressRaw,
        challengeId: credential.challenge.id,
        receiptReference: payloadReceiptReference ?? credential.challenge.id,
      });

      return okWriteResponse("contribution", result.contributionId, result.rfsNextState);
    });

    return paidHandler(request);
  } catch (error) {
    return errorResponseFrom(error);
  }
}
