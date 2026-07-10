import { getApplicationEligibility } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ rfsId: string }> }) { return getApplicationEligibility((await context.params).rfsId)(request); }
