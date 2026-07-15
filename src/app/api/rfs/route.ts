import { api } from "../../../../convex/_generated/api";
import { fetchAuthMutation } from "@/lib/auth-server";
import { getMppFundingTokenAddress } from "@/lib/mpp";
import { isMvpPaymentBaseUnits } from "@/lib/tempo";

import {
  okWrite,
  problem,
  requireAuthenticatedRoute,
  responseFromError,
} from "@/lib/api/http";
import { parseCreateRfsRequest } from "@/lib/api/parsers";

export async function POST(request: Request) {
  try {
    await requireAuthenticatedRoute();
    const body = await parseCreateRfsRequest(request);
    if (!isMvpPaymentBaseUnits(body.minimumContributionBaseUnits)) {
      return problem(
        "INVALID_MINIMUM_CONTRIBUTION",
        "Minimum contribution must be 1..9000 testnet base units.",
        400,
      );
    }

    const result = await fetchAuthMutation(api.rfs.create, {
      title: body.title,
      description: body.description,
      scope: body.scope,
      tags: body.tags,
      fundingThresholdBaseUnits: body.fundingThresholdBaseUnits,
      minimumContributionBaseUnits: body.minimumContributionBaseUnits,
      fundingTokenAddress: getMppFundingTokenAddress(),
    });

    return okWrite("rfs", result.rfsId, result.nextState, undefined, 201);
  } catch (error) {
    return responseFromError(error);
  }
}
