import { fetchQuery } from "convex/nextjs";

import { api } from "../../../../convex/_generated/api";
import { toMarketplacePageDto } from "@/lib/api/dto";
import { ok, responseFromError } from "@/lib/api/http";
import { parseMarketplaceQuery } from "@/lib/api/parsers";

export async function GET(request: Request) {
  try {
    const result = await fetchQuery(
      api.marketplace.list,
      parseMarketplaceQuery(request.url),
    );

    return ok(toMarketplacePageDto(result));
  } catch (error) {
    return responseFromError(error);
  }
}
