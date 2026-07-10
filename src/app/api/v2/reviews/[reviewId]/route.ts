import { getReview } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ reviewId: string }> }) { return getReview((await context.params).reviewId)(request); }
