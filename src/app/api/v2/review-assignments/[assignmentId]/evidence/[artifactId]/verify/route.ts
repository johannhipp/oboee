import { verifyReviewEvidence } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ assignmentId: string; artifactId: string }> }) { const params = await context.params; return verifyReviewEvidence(params.assignmentId, params.artifactId)(request); }
