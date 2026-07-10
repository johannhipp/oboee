import { createApplication, listApplications } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ rfsId: string }> }) { return listApplications((await context.params).rfsId)(request); }
export async function POST(request: Request, context: { params: Promise<{ rfsId: string }> }) { return createApplication((await context.params).rfsId)(request); }
