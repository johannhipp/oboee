import { completeReviewAssignment } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ assignmentId: string }> }) { return completeReviewAssignment((await context.params).assignmentId)(request); }
