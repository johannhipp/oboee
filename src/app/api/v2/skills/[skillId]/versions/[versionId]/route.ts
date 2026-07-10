import { getSkillVersion } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ skillId: string; versionId: string }> }) { const params = await context.params; return getSkillVersion(params.skillId, params.versionId)(request); }
