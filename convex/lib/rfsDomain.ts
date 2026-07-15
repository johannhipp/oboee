import type { RfsStatus } from "../../shared/domain/status";

export const canFundRfs = (status: RfsStatus) => status === "open";

export const canClaimRfs = (
  rfs: { claimantUserId?: string; status: RfsStatus },
) => rfs.status === "funded" && !rfs.claimantUserId;

export const canSubmitRfs = (
  rfs: { claimantUserId?: string; status: RfsStatus },
  viewerUserId: string | undefined,
) =>
  Boolean(
    viewerUserId &&
      rfs.claimantUserId === viewerUserId &&
      rfs.status === "funded",
  );

export const fundingStateAfterContribution = (
  currentAmountBaseUnits: bigint,
  contributionAmountBaseUnits: bigint,
  fundingThresholdBaseUnits: bigint,
): Extract<RfsStatus, "open" | "funded"> =>
  currentAmountBaseUnits < fundingThresholdBaseUnits &&
  currentAmountBaseUnits + contributionAmountBaseUnits >=
    fundingThresholdBaseUnits
    ? "funded"
    : "open";

export const fundingEarningSourceKey = (rfsId: string) => `funding:${rfsId}`;
export const purchaseEarningSourceKey = (purchaseId: string) =>
  `purchase:${purchaseId}`;
