import { listDisputes, openDispute } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ rfsId: string }> }) { return listDisputes((await context.params).rfsId)(request); }
export async function POST(request: Request, context: { params: Promise<{ rfsId: string }> }) { return openDispute((await context.params).rfsId)(request); }
