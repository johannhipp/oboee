import { cancelRfs, getRfs, reviseRfs } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ rfsId: string }> }) { return getRfs((await context.params).rfsId)(request); }
export async function PATCH(request: Request, context: { params: Promise<{ rfsId: string }> }) { return reviseRfs((await context.params).rfsId)(request); }
export async function DELETE(request: Request, context: { params: Promise<{ rfsId: string }> }) { return cancelRfs((await context.params).rfsId)(request); }
