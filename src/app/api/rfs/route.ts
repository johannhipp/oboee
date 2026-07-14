import { retiredApiResponse } from "@/lib/api-v2/legacy-routes";

export async function GET() {
  return retiredApiResponse({ replacementMethod: "GET", replacementPath: "/api/v2/rfs", message: "The unversioned RFS list is retired. Use the policy-v2 RFS projection." });
}

export async function POST() {
  return retiredApiResponse({ replacementMethod: "POST", replacementPath: "/api/v2/rfs", message: "Policy-v1 RFS creation is retired. Create a criteria-bound policy-v2 RFS." });
}
