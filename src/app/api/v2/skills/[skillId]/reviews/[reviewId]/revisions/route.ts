import { reviseSkillReview } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ skillId: string; reviewId: string }> }) { const params = await context.params; return reviseSkillReview(params.skillId, params.reviewId)(request); }
