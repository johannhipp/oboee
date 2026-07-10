import { getSkill } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ skillId: string }> }) { return getSkill((await context.params).skillId)(request); }
