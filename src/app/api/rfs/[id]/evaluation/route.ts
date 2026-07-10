import { retiredApiResponse } from "@/lib/api-v2/legacy-routes";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return retiredApiResponse({ replacementMethod: "GET", replacementPath: `/api/v2/rfs/${(await context.params).id}/evaluation-workspace`, message: "The policy-v1 evaluation projection is retired. Use the authorized criterion workspace." });
}
