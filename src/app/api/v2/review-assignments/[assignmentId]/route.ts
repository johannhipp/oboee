import { getReviewAssignment } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ assignmentId: string }> }) { return getReviewAssignment((await context.params).assignmentId)(request); }
