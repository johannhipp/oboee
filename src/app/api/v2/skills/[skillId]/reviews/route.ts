import { createSkillReview, listSkillReviews } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ skillId: string }> }) { return listSkillReviews((await context.params).skillId)(request); }
export async function POST(request: Request, context: { params: Promise<{ skillId: string }> }) { return createSkillReview((await context.params).skillId)(request); }
