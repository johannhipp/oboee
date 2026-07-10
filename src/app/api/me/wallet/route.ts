import { retiredApiResponse } from "@/lib/api-v2/legacy-routes";

export async function POST() {
  return retiredApiResponse({ replacementMethod: "POST", replacementPath: "/api/v2/me/wallet-challenges", message: "Direct wallet linking is retired. Create and prove a v2 wallet challenge." });
}
