import { api } from "../../../../../convex/_generated/api";
import { fetchAuthMutation } from "@/lib/auth-server";
import {
  okWrite,
  requireAuthenticatedRoute,
  responseFromError,
} from "@/lib/api/http";
import { parseWalletRequest } from "@/lib/api/parsers";

export async function POST(request: Request) {
  try {
    await requireAuthenticatedRoute();
    const body = await parseWalletRequest(request);

    const result = await fetchAuthMutation(api.users.updateWallet, {
      walletAddress: body.walletAddress,
    });

    return okWrite("user", result.userId, "wallet_preference_saved");
  } catch (error) {
    return responseFromError(error);
  }
}
