import { fundingIntentRoute } from "@/lib/api-v2/payment";
export async function POST(request: Request, context: { params: Promise<{ rfsId: string }> }) { return fundingIntentRoute(request, (await context.params).rfsId); }
