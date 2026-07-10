import { getSkillInstalls } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ skillId: string }> }) { return getSkillInstalls((await context.params).skillId)(request); }
