import { fetchQuery } from "convex/nextjs";

import { api } from "../../../../convex/_generated/api";
import { errorResponseFrom } from "../_lib/responses";
import { toJsonSafe } from "@/lib/json";
import { readTagParams } from "@/lib/api-params";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status") ?? undefined;
    const q = searchParams.get("q") ?? undefined;
    const authorId = searchParams.get("authorId") ?? undefined;

    const tags = readTagParams(searchParams);

    const result = await fetchQuery(api.skills.list, {
      status:
        status === "open" || status === "funded" || status === "published" ? status : undefined,
      q,
      authorId,
      tags,
    });

    return Response.json(toJsonSafe(result));
  } catch (error) {
    return errorResponseFrom(error);
  }
}
