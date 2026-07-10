import { submitSkill } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ rfsId: string }> }) { return submitSkill((await context.params).rfsId)(request); }
