import { approveOperatorRecovery } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ recoveryId: string }> }) { return approveOperatorRecovery((await context.params).recoveryId)(request); }
