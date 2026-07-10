import { moderateReview } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ reviewId: string }> }) { return moderateReview((await context.params).reviewId)(request); }
