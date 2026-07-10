import { retiredApiResponse } from "@/lib/api-v2/legacy-routes";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return retiredApiResponse({ replacementMethod: "GET", replacementPath: `/api/v2/skills/${(await context.params).id}`, message: "The unversioned skill representation is retired. Use the policy-v2 skill resource and capabilities." });
}
