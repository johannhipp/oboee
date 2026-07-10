import { getAuthor } from "@/lib/api-v2/handlers";
export async function GET(request: Request, context: { params: Promise<{ handle: string }> }) { return getAuthor((await context.params).handle)(request); }
