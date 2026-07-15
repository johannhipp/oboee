import { api } from "../../../../../convex/_generated/api";
import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";

import { errorResponse, errorResponseFrom, okWriteResponse } from "../../_lib/responses";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
  }

  try {
    const body = (await request.json()) as { walletAddress?: unknown };
    if (typeof body.walletAddress !== "string") {
      return errorResponse("INVALID_WALLET_ADDRESS", "walletAddress must be a string.", 400);
    }

    const result = await fetchAuthMutation(api.users.updateWallet, {
      walletAddress: body.walletAddress,
    });

    return okWriteResponse("user", result.userId, "wallet_linked");
  } catch (error) {
    return errorResponseFrom(error);
  }
}
