import { getOperation } from "@/lib/api-v2/handlers";

export async function GET(request: Request, context: { params: Promise<{ operationId: string }> }) {
  return getOperation((await context.params).operationId)(request);
}
