import { acceptReviewAssignment } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ assignmentId: string }> }) { return acceptReviewAssignment((await context.params).assignmentId, true)(request); }
