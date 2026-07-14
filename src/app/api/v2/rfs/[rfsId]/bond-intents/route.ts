import { bondIntentRoute } from "@/lib/api-v2/payment";
export async function POST(request: Request, { params }: { params: Promise<{ rfsId: string }> }) {
  return bondIntentRoute(request, (await params).rfsId);
}
