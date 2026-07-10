import { getFixture } from "@/lib/api-v2/handlers";

export async function GET(request: Request, context: { params: Promise<{ fixtureVersionId: string }> }) {
  return getFixture((await context.params).fixtureVersionId)(request);
}
