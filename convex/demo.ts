import { ConvexError, v } from "convex/values";

import { TEMPO_MODERATO_PATH_USD } from "../shared/domain/tempo";
import { internalMutation } from "./_generated/server";

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
const FUNDING_THRESHOLD_BASE_UNITS = BigInt(9_000);
const MINIMUM_CONTRIBUTION_BASE_UNITS = BigInt(1_000);

export const prepareCveCrowdfundingDemo = internalMutation({
  args: {
    runId: v.string(),
  },
  returns: v.object({
    rfsId: v.id("rfs"),
    currentAmountBaseUnits: v.string(),
    fundingThresholdBaseUnits: v.string(),
    minimumContributionBaseUnits: v.string(),
    nextState: v.literal("open"),
  }),
  handler: async (ctx, args) => {
    const runId = args.runId.trim().toLowerCase();
    if (!RUN_ID_PATTERN.test(runId)) {
      throw new ConvexError({
        code: "INVALID_DEMO_RUN_ID",
        message:
          "Demo runId must contain 3..64 lowercase letters, numbers, or hyphens.",
      });
    }

    const rfsId = await ctx.db.insert("rfs", {
      authorUserId: `demo:security-team:${runId}`,
      claimantUserId: undefined,
      title: `Mitigate CVE-2023-44487 in our NGINX + Node.js edge (${runId})`,
      description:
        "A security engineer found an internet-facing HTTP/2 configuration that may be exposed to Rapid Reset abuse and needs a version-specific mitigation playbook.",
      scope:
        "Cover affected-version detection, immediate load shedding, safe NGINX and Node.js configuration changes, controlled verification, observability, and rollback checks.",
      tags: ["cve-2023-44487", "http2", "nginx", "nodejs", "demo"],
      fundingThresholdBaseUnits: FUNDING_THRESHOLD_BASE_UNITS,
      minimumContributionBaseUnits: MINIMUM_CONTRIBUTION_BASE_UNITS,
      currentAmountBaseUnits: BigInt(0),
      fundingTokenAddress: TEMPO_MODERATO_PATH_USD,
      status: "open",
    });

    return {
      rfsId,
      currentAmountBaseUnits: "0",
      fundingThresholdBaseUnits: FUNDING_THRESHOLD_BASE_UNITS.toString(),
      minimumContributionBaseUnits: MINIMUM_CONTRIBUTION_BASE_UNITS.toString(),
      nextState: "open" as const,
    };
  },
});
