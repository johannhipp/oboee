import { uploadEvidence } from "@/lib/api-v2/evidence";

export async function POST(request: Request, context: { params: Promise<{ rfsId: string }> }) {
  return uploadEvidence((await context.params).rfsId)(request);
}
