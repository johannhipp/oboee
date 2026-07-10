import { getRecoveryStatus } from "@/lib/api-v2/handlers";

export async function GET(request: Request, context: { params: Promise<{ recoveryId: string }> }) {
  return getRecoveryStatus((await context.params).recoveryId)(request);
}
