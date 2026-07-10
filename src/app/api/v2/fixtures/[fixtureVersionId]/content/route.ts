import { getFixtureContent } from "@/lib/api-v2/handlers";

export async function GET(request: Request, context: { params: Promise<{ fixtureVersionId: string }> }) {
  return getFixtureContent((await context.params).fixtureVersionId)(request);
}
