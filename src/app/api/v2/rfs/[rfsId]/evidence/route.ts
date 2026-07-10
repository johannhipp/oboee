import { getEvidence } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ rfsId: string }> }) { return getEvidence((await context.params).rfsId)(request); }
