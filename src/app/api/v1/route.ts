import { retiredApiResponse } from "@/lib/api-v2/legacy-routes";

const response = () => retiredApiResponse({ message: "The policy-v1 API is retired. Use the versioned policy-v2 contract." });

export const GET = response;
export const POST = response;
export const PATCH = response;
export const DELETE = response;
