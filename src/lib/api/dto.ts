import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";

type RfsDetail = FunctionReturnType<typeof api.rfs.getPublic>;
type SkillDetail = FunctionReturnType<typeof api.skills.getBySkill>;
type MarketplacePage = FunctionReturnType<typeof api.marketplace.list>;

const rfsDto = (rfs: RfsDetail["rfs"]) => ({
  id: rfs._id,
  createdAt: rfs._creationTime,
  authorUserId: rfs.authorUserId,
  claimantUserId: rfs.claimantUserId ?? null,
  title: rfs.title,
  description: rfs.description,
  scope: rfs.scope,
  tags: rfs.tags,
  fundingThresholdBaseUnits: rfs.fundingThresholdBaseUnits.toString(),
  minimumContributionBaseUnits: rfs.minimumContributionBaseUnits.toString(),
  currentAmountBaseUnits: rfs.currentAmountBaseUnits.toString(),
  fundingTokenAddress: rfs.fundingTokenAddress,
  status: rfs.status,
});

const actionDto = (action: SkillDetail["availableActions"][number]) => {
  switch (action.kind) {
    case "fund":
      return {
        ...action,
        minimumContributionBaseUnits:
          action.minimumContributionBaseUnits.toString(),
      };
    case "purchase":
      return {
        ...action,
        purchasePriceBaseUnits: action.purchasePriceBaseUnits.toString(),
      };
    case "claim":
    case "submit":
    case "read":
      return action;
    default:
      action satisfies never;
      throw new Error("Unknown marketplace action.");
  }
};

export const toRfsDetailDto = (detail: RfsDetail) => ({
  resourceType: "rfs" as const,
  resourceId: detail.rfs._id,
  rfs: rfsDto(detail.rfs),
  capabilities: {
    canFund: detail.canFund,
    canClaim: detail.canClaim,
    hasClaimant: detail.hasClaimant,
  },
});

export const toSkillDetailDto = (detail: SkillDetail) => ({
  resourceType: "skill" as const,
  resourceId: detail.skill?._id ?? detail.rfs._id,
  rfs: rfsDto(detail.rfs),
  skill: detail.skill
    ? {
        id: detail.skill._id,
        rfsId: detail.skill.rfsId,
        authorUserId: detail.skill.authorUserId,
        summary: detail.skill.summary,
        tags: detail.skill.tags,
        purchasePriceBaseUnits:
          detail.skill.purchasePriceBaseUnits.toString(),
        status: detail.skill.status,
        createdAt: detail.skill._creationTime,
      }
    : null,
  hasAccess: detail.hasAccess,
  availableActions: detail.availableActions.map(actionDto),
});

export const toMarketplacePageDto = (page: MarketplacePage) => ({
  items: page.items.map((item) =>
    item.kind === "request"
      ? {
          kind: item.kind,
          itemId: item.itemId,
          rfsId: item.rfsId,
          detailHref: item.detailHref,
          status: item.status,
          authorUserId: item.authorUserId,
          authorLabel: item.authorLabel,
          title: item.title,
          description: item.description,
          scope: item.scope,
          tags: item.tags,
          createdAt: item.createdAt,
          fundingTokenAddress: item.fundingTokenAddress,
          fundingThresholdBaseUnits:
            item.fundingThresholdBaseUnits.toString(),
          minimumContributionBaseUnits:
            item.minimumContributionBaseUnits.toString(),
          currentAmountBaseUnits: item.currentAmountBaseUnits.toString(),
        }
      : {
          kind: item.kind,
          itemId: item.itemId,
          rfsId: item.rfsId,
          skillId: item.skillId,
          detailHref: item.detailHref,
          status: item.status,
          authorUserId: item.authorUserId,
          authorLabel: item.authorLabel,
          title: item.title,
          description: item.description,
          scope: item.scope,
          summary: item.summary,
          tags: item.tags,
          createdAt: item.createdAt,
          currencyAddress: item.currencyAddress,
          purchasePriceBaseUnits: item.purchasePriceBaseUnits.toString(),
        },
  ),
  nextCursor: page.nextCursor,
  isDone: page.isDone,
});
