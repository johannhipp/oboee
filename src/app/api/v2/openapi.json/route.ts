import { openApiDocument } from "@/lib/api-v2/openapi";

export async function GET() {
  return Response.json(openApiDocument, { headers: { "cache-control": "public, max-age=300" } });
}
