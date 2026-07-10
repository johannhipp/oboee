import { resolveHumanAction } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ actionId: string }> }) { return resolveHumanAction((await context.params).actionId, false)(request); }
