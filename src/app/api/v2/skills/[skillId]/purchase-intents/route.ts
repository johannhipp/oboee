import { purchaseIntentRoute } from "@/lib/api-v2/payment";
export async function POST(request: Request, context: { params: Promise<{ skillId: string }> }) { return purchaseIntentRoute(request, (await context.params).skillId); }
