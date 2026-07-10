import { getSettlement } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ rfsId: string }> }) { return getSettlement((await context.params).rfsId)(request); }
