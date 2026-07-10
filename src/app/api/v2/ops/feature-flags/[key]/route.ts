import { setOperatorFeatureFlag } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ key: string }> }) { return setOperatorFeatureFlag((await context.params).key)(request); }
