import { getMyHumanAction } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ actionId: string }> }) { return getMyHumanAction((await context.params).actionId)(request); }
