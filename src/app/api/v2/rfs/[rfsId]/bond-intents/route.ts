import { bondIntentRoute } from "@/lib/api-v2/payment";
export async function POST(request: Request) { return bondIntentRoute(request); }
