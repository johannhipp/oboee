import { supersedeEvaluation } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ rfsId: string; evaluationId: string }> }) { const params = await context.params; return supersedeEvaluation(params.rfsId, params.evaluationId)(request); }
