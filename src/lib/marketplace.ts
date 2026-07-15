import type { FunctionReturnType } from "convex/server";

import type { api } from "../../convex/_generated/api";
import type { RfsStatus } from "../../shared/domain/status";

export type MarketplacePage = FunctionReturnType<typeof api.marketplace.list>;
export type MarketplaceItem = MarketplacePage["items"][number];

export type MarketplaceRowView = {
  kind: "request" | "skill";
  itemId: string;
  detailHref?: string;
  status: RfsStatus;
  title: string;
  authorUserId: string;
  authorLabel: string;
  createdAt: number;
  currentAmountBaseUnits?: bigint;
  fundingThresholdBaseUnits?: bigint;
  purchasePriceBaseUnits?: bigint;
};

export const createMarketplaceRequestPreview = (input: {
  title: string;
  fundingThresholdBaseUnits: bigint;
}): MarketplaceRowView => ({
  kind: "request",
  itemId: "preview",
  status: "open",
  title: input.title.trim() || "new request",
  authorUserId: "you",
  authorLabel: "you",
  createdAt: 0,
  currentAmountBaseUnits: BigInt(0),
  fundingThresholdBaseUnits: input.fundingThresholdBaseUnits,
});
