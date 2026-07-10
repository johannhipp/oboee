import { retiredApiResponse } from "@/lib/api-v2/legacy-routes";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return retiredApiResponse({
    replacementMethod: "GET",
    replacementPath: `/api/v2/skills/${(await context.params).id}`,
    message:
      "This content endpoint is retired. Read the v2 skill resource and follow its exact-version purchase or content capability.",
  });
}
