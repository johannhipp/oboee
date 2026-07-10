import { resolveAdjudication } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ disputeId: string }> }) { return resolveAdjudication((await context.params).disputeId)(request); }
