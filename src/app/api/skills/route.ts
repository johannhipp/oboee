import { retiredApiResponse } from "@/lib/api-v2/legacy-routes";

export async function GET() {
  return retiredApiResponse({ replacementMethod: "GET", replacementPath: "/api/v2/catalog", message: "The unversioned catalog is retired. Use the ranked policy-v2 catalog." });
}
