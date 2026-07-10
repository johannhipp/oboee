import { reviseApplication } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ rfsId: string; applicationId: string }> }) { const params = await context.params; return reviseApplication(params.rfsId, params.applicationId)(request); }
