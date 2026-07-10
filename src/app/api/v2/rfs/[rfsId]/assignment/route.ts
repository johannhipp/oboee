import { getAssignment } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ rfsId: string }> }) { return getAssignment((await context.params).rfsId)(request); }
