import { fetchQuery } from "convex/nextjs";

import { api } from "../../../../convex/_generated/api";
import { errorResponseFrom } from "../_lib/responses";

const toJsonSafe = (value: unknown): unknown => {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        toJsonSafe(item),
      ]),
    );
  }
  return value;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status") ?? undefined;
    const q = searchParams.get("q") ?? undefined;
    const authorId = searchParams.get("authorId") ?? undefined;

    const repeatedTags = searchParams.getAll("tags");
    const csvTags = searchParams
      .get("tags")
      ?.split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    const tags = (repeatedTags.length > 0 ? repeatedTags : csvTags) ?? undefined;

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
