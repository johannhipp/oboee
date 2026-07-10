import { withdrawApplication } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ rfsId: string; applicationId: string }> }) { const params = await context.params; return withdrawApplication(params.rfsId, params.applicationId)(request); }
