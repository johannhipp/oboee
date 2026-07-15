import { api } from "../../../../convex/_generated/api";
import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";

import { errorResponse, errorResponseFrom, okWriteResponse } from "../_lib/responses";

const parseBaseUnits = (value: unknown): bigint | null => {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return null;
};

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
  }

  try {
    const body = (await request.json()) as {
      title?: unknown;
      description?: unknown;
      scope?: unknown;
      tags?: unknown;
      fundingThresholdBaseUnits?: unknown;
      minimumContributionBaseUnits?: unknown;
      fundingTokenAddress?: unknown;
    };

    if (
      typeof body.title !== "string" ||
      typeof body.description !== "string" ||
      typeof body.scope !== "string" ||
      !Array.isArray(body.tags) ||
      !body.tags.every((tag) => typeof tag === "string")
    ) {
      return errorResponse("INVALID_ARGUMENT", "Invalid create RFS payload.", 400);
    }

    const fundingTokenAddress =
      typeof body.fundingTokenAddress === "string" && body.fundingTokenAddress.trim().length > 0
        ? body.fundingTokenAddress
        : process.env.MPP_FUNDING_TOKEN_ADDRESS;

    if (!fundingTokenAddress) {
      return errorResponse(
        "INVALID_ARGUMENT",
        "fundingTokenAddress is required when MPP_FUNDING_TOKEN_ADDRESS is unset.",
        400,
      );
    }

    const fundingThresholdBaseUnits = parseBaseUnits(body.fundingThresholdBaseUnits);
    const minimumContributionBaseUnits = parseBaseUnits(body.minimumContributionBaseUnits);

    if (fundingThresholdBaseUnits === null || minimumContributionBaseUnits === null) {
      return errorResponse("INVALID_ARGUMENT", "Base unit values must be integer strings.", 400);
    }

    const result = await fetchAuthMutation(api.rfs.create, {
      title: body.title,
      description: body.description,
      scope: body.scope,
      tags: body.tags,
      fundingThresholdBaseUnits,
      minimumContributionBaseUnits,
      fundingTokenAddress,
    });

    return okWriteResponse("rfs", result.rfsId, result.nextState);
  } catch (error) {
    return errorResponseFrom(error);
  }
}
