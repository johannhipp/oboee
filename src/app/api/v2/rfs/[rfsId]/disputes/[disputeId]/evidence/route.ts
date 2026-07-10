import { appendDisputeEvidence } from "@/lib/api-v2/handlers";

export async function POST(request: Request, context: { params: Promise<{ rfsId: string; disputeId: string }> }) {
  const { rfsId, disputeId } = await context.params;
  return appendDisputeEvidence(rfsId, disputeId)(request);
}
