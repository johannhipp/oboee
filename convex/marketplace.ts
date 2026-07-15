import { ConvexError, type Infer, v } from "convex/values";

import { query } from "./_generated/server";
import { normalizeTags } from "../shared/domain/strings";
import { rfsStatusValidator } from "./lib/validators";

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 24;
const MAX_SCAN_PER_KIND = 100;

export const marketplaceRequestValidator = v.object({
  kind: v.literal("request"),
  itemId: v.string(),
  rfsId: v.id("rfs"),
  detailHref: v.string(),
  status: v.union(v.literal("open"), v.literal("funded")),
  authorUserId: v.string(),
  authorLabel: v.string(),
  title: v.string(),
  description: v.string(),
  scope: v.string(),
  tags: v.array(v.string()),
  createdAt: v.number(),
  fundingTokenAddress: v.string(),
  fundingThresholdBaseUnits: v.int64(),
  minimumContributionBaseUnits: v.int64(),
  currentAmountBaseUnits: v.int64(),
});

export const marketplaceSkillValidator = v.object({
  kind: v.literal("skill"),
  itemId: v.string(),
  rfsId: v.id("rfs"),
  skillId: v.id("skills"),
  detailHref: v.string(),
  status: v.literal("published"),
  authorUserId: v.string(),
  authorLabel: v.string(),
  title: v.string(),
  description: v.string(),
  scope: v.string(),
  summary: v.string(),
  tags: v.array(v.string()),
  createdAt: v.number(),
  currencyAddress: v.string(),
  purchasePriceBaseUnits: v.int64(),
});

export const marketplaceItemValidator = v.union(
  marketplaceRequestValidator,
  marketplaceSkillValidator,
);

export type MarketplaceItem = Infer<typeof marketplaceItemValidator>;

const authorLabel = (userId: string) =>
  userId.length > 12 ? `${userId.slice(0, 10)}…` : userId;

const matchesSearch = (item: MarketplaceItem, normalizedQuery: string) => {
  if (!normalizedQuery) {
    return true;
  }
  const fields = [
    item.title,
    item.description,
    item.scope,
    item.tags.join(" "),
    item.kind === "skill" ? item.summary : "",
  ];
  return fields.some((field) => field.toLowerCase().includes(normalizedQuery));
};

const parsePagination = (cursor: string | undefined, requestedLimit?: number) => {
  const limit = requestedLimit ?? DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new ConvexError({
      code: "INVALID_PAGINATION",
      message: `limit must be an integer from 1 to ${MAX_PAGE_SIZE}.`,
    });
  }
  if (cursor === undefined) {
    return { limit, offset: 0 };
  }
  if (!/^\d+$/.test(cursor)) {
    throw new ConvexError({
      code: "INVALID_CURSOR",
      message: "Pagination cursor is invalid.",
    });
  }
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset)) {
    throw new ConvexError({
      code: "INVALID_CURSOR",
      message: "Pagination cursor is invalid.",
    });
  }
  return { limit, offset };
};

export const list = query({
  args: {
    status: v.optional(rfsStatusValidator),
    q: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    authorId: v.optional(v.string()),
    kind: v.optional(v.union(v.literal("request"), v.literal("skill"))),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(marketplaceItemValidator),
    nextCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { limit, offset } = parsePagination(args.cursor, args.limit);
    const normalizedQuery = args.q?.trim().toLowerCase() ?? "";
    const requiredTags = normalizeTags(args.tags ?? []);
    const includeRequests =
      args.kind !== "skill" && args.status !== "published";
    const includeSkills =
      args.kind !== "request" &&
      (args.status === undefined || args.status === "published");

    const requestStatuses = args.status
      ? args.status === "published"
        ? []
        : [args.status]
      : (["open", "funded"] as const);
    const requestPages = includeRequests
      ? await Promise.all(
          requestStatuses.map((status) =>
            ctx.db
              .query("rfs")
              .withIndex("by_status", (query) => query.eq("status", status))
              .order("desc")
              .take(MAX_SCAN_PER_KIND),
          ),
        )
      : [];
    const requests: MarketplaceItem[] = requestPages
      .flat()
      .flatMap((rfs) =>
        rfs.status === "published"
          ? []
          : [
              {
                kind: "request" as const,
                itemId: rfs._id,
                rfsId: rfs._id,
                detailHref: `/browse/${rfs._id}`,
                status: rfs.status,
                authorUserId: rfs.authorUserId,
                authorLabel: authorLabel(rfs.authorUserId),
                title: rfs.title,
                description: rfs.description,
                scope: rfs.scope,
                tags: rfs.tags,
                createdAt: rfs._creationTime,
                fundingTokenAddress: rfs.fundingTokenAddress,
                fundingThresholdBaseUnits: rfs.fundingThresholdBaseUnits,
                minimumContributionBaseUnits: rfs.minimumContributionBaseUnits,
                currentAmountBaseUnits: rfs.currentAmountBaseUnits,
              },
            ],
      );

    const publishedSkills = includeSkills
      ? await ctx.db
          .query("skills")
          .withIndex("by_status", (query) => query.eq("status", "published"))
          .order("desc")
          .take(MAX_SCAN_PER_KIND)
      : [];
    const skills = (
      await Promise.all(
        publishedSkills.map(async (skill): Promise<MarketplaceItem | null> => {
          const rfs = await ctx.db.get(skill.rfsId);
          if (!rfs) {
            return null;
          }
          return {
            kind: "skill",
            itemId: skill._id,
            rfsId: rfs._id,
            skillId: skill._id,
            detailHref: `/browse/${rfs._id}`,
            status: "published",
            authorUserId: skill.authorUserId,
            authorLabel: authorLabel(skill.authorUserId),
            title: rfs.title,
            description: rfs.description,
            scope: rfs.scope,
            summary: skill.summary,
            tags: skill.tags,
            createdAt: skill._creationTime,
            currencyAddress: rfs.fundingTokenAddress,
            purchasePriceBaseUnits: skill.purchasePriceBaseUnits,
          };
        }),
      )
    ).filter((item): item is MarketplaceItem => item !== null);

    const filtered = [...requests, ...skills]
      .filter((item) => {
        if (args.authorId && item.authorUserId !== args.authorId) {
          return false;
        }
        if (
          requiredTags.length > 0 &&
          !requiredTags.every((tag) => item.tags.includes(tag))
        ) {
          return false;
        }
        return matchesSearch(item, normalizedQuery);
      })
      .sort(
        (left, right) =>
          right.createdAt - left.createdAt ||
          left.itemId.localeCompare(right.itemId),
      );

    const items = filtered.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    const isDone = nextOffset >= filtered.length;
    return {
      items,
      nextCursor: isDone ? null : nextOffset.toString(),
      isDone,
    };
  },
});
