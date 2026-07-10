import { resolveOperatorMigrationFinding } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ findingId: string }> }) { return resolveOperatorMigrationFinding((await context.params).findingId)(request); }
