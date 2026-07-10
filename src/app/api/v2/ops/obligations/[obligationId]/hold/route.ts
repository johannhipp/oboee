import { setOperatorObligationHold } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ obligationId: string }> }) { return setOperatorObligationHold((await context.params).obligationId)(request); }
