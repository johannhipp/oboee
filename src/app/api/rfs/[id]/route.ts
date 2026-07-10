import { retiredApiResponse } from "@/lib/api-v2/legacy-routes";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return retiredApiResponse({ replacementMethod: "GET", replacementPath: `/api/v2/rfs/${(await context.params).id}`, message: "The unversioned RFS representation is retired. Read its policy-v2 contract." });
}
