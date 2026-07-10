import { getOperatorIdentityPreview, overrideOperatorIdentity } from "@/lib/api-v2/handlers";

export const POST = overrideOperatorIdentity;
export const GET = getOperatorIdentityPreview;
