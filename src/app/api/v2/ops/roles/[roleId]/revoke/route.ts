import { revokeOperatorRole } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ roleId: string }> }) { return revokeOperatorRole((await context.params).roleId)(request); }
