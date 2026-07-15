import { api } from "../../../../../../convex/_generated/api";
import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";
import { isMvpPaymentBaseUnits } from "@/lib/tempo";

import { errorResponse, errorResponseFrom, okWriteResponse } from "../../../_lib/responses";

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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
  }

  try {
    const body = (await request.json()) as {
      contentMarkdown?: unknown;
      summary?: unknown;
      tags?: unknown;
      purchasePriceBaseUnits?: unknown;
    };

    if (
      typeof body.contentMarkdown !== "string" ||
      typeof body.summary !== "string" ||
      !Array.isArray(body.tags) ||
      !body.tags.every((tag) => typeof tag === "string")
    ) {
      return errorResponse("INVALID_ARGUMENT", "Invalid submit payload.", 400);
    }

    const purchasePriceBaseUnits = parseBaseUnits(body.purchasePriceBaseUnits);
    if (purchasePriceBaseUnits === null) {
      return errorResponse("INVALID_ARGUMENT", "purchasePriceBaseUnits must be an integer string.", 400);
    }
    if (!isMvpPaymentBaseUnits(purchasePriceBaseUnits)) {
      return errorResponse(
        "INVALID_ARGUMENT",
        "For MVP testing, purchasePriceBaseUnits must be 1..9000 base units.",
        400,
      );
    }

    const { id } = await context.params;

    const result = await fetchAuthMutation(api.rfs.submit, {
      rfsId: id,
      contentMarkdown: body.contentMarkdown,
      summary: body.summary,
      tags: body.tags,
      purchasePriceBaseUnits,
    });

    return okWriteResponse("rfs", result.rfsId, result.nextState);
  } catch (error) {
    return errorResponseFrom(error);
  }
}
