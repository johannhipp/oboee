import { createEvaluation, listEvaluations } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ rfsId: string }> }) { return listEvaluations((await context.params).rfsId)(request); }
export async function POST(request: Request, context: { params: Promise<{ rfsId: string }> }) { return createEvaluation((await context.params).rfsId)(request); }
