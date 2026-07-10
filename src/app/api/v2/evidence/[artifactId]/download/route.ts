import { downloadEvidence } from "@/lib/api-v2/evidence";

export async function GET(request: Request, context: { params: Promise<{ artifactId: string }> }) {
  return downloadEvidence((await context.params).artifactId)(request);
}
