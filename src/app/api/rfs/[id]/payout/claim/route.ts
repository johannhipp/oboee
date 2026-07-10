import { retiredApiResponse } from "@/lib/api-v2/legacy-routes";

export async function POST() {
  return retiredApiResponse({ replacementMethod: "GET", replacementPath: "/api/v2/me/obligations", message: "Self-claimed policy-v1 payouts are retired. Policy-v2 settlement creates custody obligations and executes them through the outbox." });
}
