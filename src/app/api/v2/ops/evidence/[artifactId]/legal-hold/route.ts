import { setOperatorEvidenceHold } from "@/lib/api-v2/handlers";
export async function POST(request: Request, context: { params: Promise<{ artifactId: string }> }) { return setOperatorEvidenceHold((await context.params).artifactId)(request); }
