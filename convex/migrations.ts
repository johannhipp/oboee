import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { stableContentHash } from "./lib/helpers";

const MIGRATION_VERSION = 2;
const POLICY_V2_FLAG = "policy_v2";

const inventoryTargetValidator = v.union(
  v.literal("rfs"),
  v.literal("contributions"),
  v.literal("payoutLedger"),
  v.literal("payoutEntries"),
  v.literal("purchases"),
);

const policyBackfillTargetValidator = v.union(
  v.literal("rfs"),
  v.literal("payoutAssessments"),
  v.literal("skills"),
  v.literal("skillVersions"),
  v.literal("contributions"),
  v.literal("evaluationEvents"),
);

const reviewTargetValidator = v.union(
  v.literal("contributions"),
  v.literal("payoutLedger"),
  v.literal("payoutAssessments"),
  v.literal("disputes"),
  v.literal("payoutEntries"),
);

const inventoryBucketValidator = v.object({
  status: v.string(),
  count: v.number(),
  primaryAmountBaseUnits: v.int64(),
  secondaryAmountBaseUnits: v.int64(),
});

const migrationResultValidator = v.object({
  migrationKey: v.string(),
  processedCount: v.number(),
  changedCount: v.number(),
  continueCursor: v.string(),
  isDone: v.boolean(),
});

type InventoryBucket = {
  status: string;
  count: number;
  primaryAmountBaseUnits: bigint;
  secondaryAmountBaseUnits: bigint;
};

type ReviewFinding = {
  findingType:
    | "synthetic_principal"
    | "claimed_without_receipt"
    | "unresolved_dispute"
    | "post_claim_purchase";
  resourceType: string;
  resourceId: string;
  details: string;
};

const summarizeInventory = <T>(
  rows: readonly T[],
  statusFor: (row: T) => string,
  amountsFor: (row: T) => readonly [bigint, bigint],
) => {
  const buckets = new Map<string, InventoryBucket>();
  for (const row of rows) {
    const status = statusFor(row);
    const [primaryAmountBaseUnits, secondaryAmountBaseUnits] = amountsFor(row);
    const bucket = buckets.get(status) ?? {
      status,
      count: 0,
      primaryAmountBaseUnits: BigInt(0),
      secondaryAmountBaseUnits: BigInt(0),
    };
    bucket.count += 1;
    bucket.primaryAmountBaseUnits += primaryAmountBaseUnits;
    bucket.secondaryAmountBaseUnits += secondaryAmountBaseUnits;
    buckets.set(status, bucket);
  }
  return [...buckets.values()].sort((left, right) => left.status.localeCompare(right.status));
};

const recordProgress = async (
  ctx: MutationCtx,
  args: {
    migrationKey: string;
    inputCursor: string | null;
    cursor: string;
    processedCount: number;
    completed: boolean;
  },
) => {
  const existing = await ctx.db
    .query("migrationProgress")
    .withIndex("by_migrationKey", (query) => query.eq("migrationKey", args.migrationKey))
    .unique();
  if (existing?.completed) {
    return;
  }
  if (existing && existing.cursor !== (args.inputCursor ?? "")) {
    throw new Error(
      `Migration ${args.migrationKey} expected cursor ${existing.cursor ?? "<start>"}; refusing an out-of-order batch.`,
    );
  }
  const next = {
    version: MIGRATION_VERSION,
    cursor: args.cursor,
    processedCount: (existing?.processedCount ?? 0) + args.processedCount,
    completed: args.completed,
    updatedAt: Date.now(),
  };
  if (existing) {
    await ctx.db.patch(existing._id, next);
  } else {
    await ctx.db.insert("migrationProgress", { migrationKey: args.migrationKey, ...next });
  }
};

const insertReviewFinding = async (ctx: MutationCtx, finding: ReviewFinding) => {
  const existing = await ctx.db
    .query("migrationReviewItems")
    .withIndex("by_findingType_and_resourceId", (query) =>
      query.eq("findingType", finding.findingType).eq("resourceId", finding.resourceId),
    )
    .unique();
  if (existing) {
    return false;
  }
  await ctx.db.insert("migrationReviewItems", {
    ...finding,
    status: "open",
    detectedAt: Date.now(),
  });
  return true;
};

export const inventoryLegacyPage = internalQuery({
  args: {
    target: inventoryTargetValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    target: inventoryTargetValidator,
    primaryAmountMeaning: v.string(),
    secondaryAmountMeaning: v.string(),
    buckets: v.array(inventoryBucketValidator),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (args.target === "rfs") {
      const page = await ctx.db.query("rfs").paginate(args.paginationOpts);
      return {
        target: args.target,
        primaryAmountMeaning: "currentAmountBaseUnits",
        secondaryAmountMeaning: "fundingThresholdBaseUnits",
        buckets: summarizeInventory(
          page.page,
          (row) => row.status,
          (row) => [row.currentAmountBaseUnits, row.fundingThresholdBaseUnits],
        ),
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      };
    }
    if (args.target === "contributions") {
      const page = await ctx.db.query("contributions").paginate(args.paginationOpts);
      return {
        target: args.target,
        primaryAmountMeaning: "amountBaseUnits",
        secondaryAmountMeaning: "unused",
        buckets: summarizeInventory(page.page, (row) => row.status, (row) => [row.amountBaseUnits, BigInt(0)]),
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      };
    }
    if (args.target === "payoutLedger") {
      const page = await ctx.db.query("payoutLedger").paginate(args.paginationOpts);
      return {
        target: args.target,
        primaryAmountMeaning: "grossAmountBaseUnits",
        secondaryAmountMeaning: "netAmountBaseUnits",
        buckets: summarizeInventory(
          page.page,
          (row) => row.status,
          (row) => [row.grossAmountBaseUnits, row.netAmountBaseUnits],
        ),
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      };
    }
    if (args.target === "payoutEntries") {
      const page = await ctx.db.query("payoutEntries").paginate(args.paginationOpts);
      return {
        target: args.target,
        primaryAmountMeaning: "grossAmountBaseUnits",
        secondaryAmountMeaning: "netAmountBaseUnits",
        buckets: summarizeInventory(
          page.page,
          (row) => `${row.source}:${row.status}`,
          (row) => [row.grossAmountBaseUnits, row.netAmountBaseUnits],
        ),
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      };
    }
    const page = await ctx.db.query("purchases").paginate(args.paginationOpts);
    return {
      target: args.target,
      primaryAmountMeaning: "amountBaseUnits",
      secondaryAmountMeaning: "unused",
      buckets: summarizeInventory(
        page.page,
        (row) => row.status ?? "legacy_confirmed",
        (row) => [row.amountBaseUnits, BigInt(0)],
      ),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const backfillLegacyPolicyPage = internalMutation({
  args: {
    target: policyBackfillTargetValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: migrationResultValidator,
  handler: async (ctx, args) => {
    let processedCount = 0;
    let changedCount = 0;
    let continueCursor = args.paginationOpts.cursor ?? "";
    let isDone = false;

    const patchPage = async <T extends { policyVersion?: number }>(
      rows: readonly T[],
      patch: (row: T) => Promise<unknown>,
    ) => {
      processedCount = rows.length;
      for (const row of rows) {
        if (row.policyVersion === undefined) {
          await patch(row);
          changedCount += 1;
        }
      }
    };

    if (args.target === "rfs") {
      const page = await ctx.db.query("rfs").paginate(args.paginationOpts);
      await patchPage(page.page, (row) => ctx.db.patch(row._id, { policyVersion: 1 }));
      ({ continueCursor, isDone } = page);
    } else if (args.target === "payoutAssessments") {
      const page = await ctx.db.query("payoutAssessments").paginate(args.paginationOpts);
      await patchPage(page.page, (row) => ctx.db.patch(row._id, { policyVersion: 1 }));
      ({ continueCursor, isDone } = page);
    } else if (args.target === "skills") {
      const page = await ctx.db.query("skills").paginate(args.paginationOpts);
      await patchPage(page.page, (row) => ctx.db.patch(row._id, { policyVersion: 1 }));
      ({ continueCursor, isDone } = page);
    } else if (args.target === "skillVersions") {
      const page = await ctx.db.query("skillVersions").paginate(args.paginationOpts);
      await patchPage(page.page, (row) => ctx.db.patch(row._id, { policyVersion: 1 }));
      ({ continueCursor, isDone } = page);
    } else if (args.target === "contributions") {
      const page = await ctx.db.query("contributions").paginate(args.paginationOpts);
      await patchPage(page.page, (row) => ctx.db.patch(row._id, { policyVersion: 1 }));
      ({ continueCursor, isDone } = page);
    } else {
      const page = await ctx.db.query("evaluationEvents").paginate(args.paginationOpts);
      await patchPage(page.page, (row) => ctx.db.patch(row._id, { policyVersion: 1 }));
      ({ continueCursor, isDone } = page);
    }

    const migrationKey = `policy-v1:${args.target}`;
    await recordProgress(ctx, {
      migrationKey,
      inputCursor: args.paginationOpts.cursor,
      cursor: continueCursor,
      processedCount,
      completed: isDone,
    });
    return { migrationKey, processedCount, changedCount, continueCursor, isDone };
  },
});

export const backfillMissingSkillVersionsPage = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: migrationResultValidator,
  handler: async (ctx, args) => {
    const page = await ctx.db.query("skills").paginate(args.paginationOpts);
    let changedCount = 0;
    for (const skill of page.page) {
      const existing = await ctx.db
        .query("skillVersions")
        .withIndex("by_skill", (query) => query.eq("skillId", skill._id))
        .first();
      if (existing) {
        continue;
      }

      const version = skill.latestVersion ?? 1;
      const contentHash =
        skill.latestContentHash ??
        stableContentHash([
          String(skill._id),
          String(version),
          skill.contentMarkdown,
          skill.summary,
          skill.tags.join(","),
          skill.purchasePriceBaseUnits.toString(),
        ]);
      const versionId = await ctx.db.insert("skillVersions", {
        skillId: skill._id,
        rfsId: skill.rfsId,
        version,
        contentHash,
        contentMarkdown: skill.contentMarkdown,
        summary: skill.summary,
        tags: skill.tags,
        purchasePriceBaseUnits: skill.purchasePriceBaseUnits,
        authorUserId: skill.authorUserId,
        status: skill.status,
        submittedAt: skill._creationTime,
        evaluationDeadline: skill._creationTime,
        policyVersion: 1,
        digestAlgorithm: contentHash.startsWith("fnv1a64:") ? "legacy_fnv1a64" : "sha256",
        quarantineState: skill.quarantineState ?? "clear",
        legacyImported: true,
      });
      await ctx.db.patch(skill._id, {
        latestVersion: version,
        latestContentHash: contentHash,
        policyVersion: skill.policyVersion ?? 1,
        ...(skill.status === "published" ? { publishedVersionId: versionId } : {}),
      });
      await ctx.db.insert("migrationReviewItems", {
        findingType: "missing_skill_version",
        resourceType: "skill",
        resourceId: String(skill._id),
        details: "Created a policy-v1 immutable version from existing skill content; no evidence or outcome was inferred.",
        status: "open",
        detectedAt: Date.now(),
      });
      changedCount += 1;
    }

    const migrationKey = "skill-version-reference-v1";
    await recordProgress(ctx, {
      migrationKey,
      inputCursor: args.paginationOpts.cursor,
      cursor: page.continueCursor,
      processedCount: page.page.length,
      completed: page.isDone,
    });
    return {
      migrationKey,
      processedCount: page.page.length,
      changedCount,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

const findingsForReviewPage = (
  target: "contributions" | "payoutLedger" | "payoutAssessments" | "disputes" | "payoutEntries",
  rows: readonly (
    | Doc<"contributions">
    | Doc<"payoutLedger">
    | Doc<"payoutAssessments">
    | Doc<"disputes">
    | Doc<"payoutEntries">
  )[],
): ReviewFinding[] => {
  if (target === "contributions") {
    return (rows as Doc<"contributions">[])
      .filter((row) => row.backerUserId.startsWith("agent:") || row.backerUserId.startsWith("seed:"))
      .map((row) => ({
        findingType: "synthetic_principal",
        resourceType: "contribution",
        resourceId: String(row._id),
        details: `Legacy contribution references synthetic backer ${row.backerUserId}.`,
      }));
  }
  if (target === "payoutLedger") {
    return (rows as Doc<"payoutLedger">[])
      .filter((row) => row.status === "claimed" && !row.receiptReference)
      .map((row) => ({
        findingType: "claimed_without_receipt",
        resourceType: "payoutLedger",
        resourceId: String(row._id),
        details: "Claimed legacy ledger has no receipt reference; external transfer must be reconciled.",
      }));
  }
  if (target === "payoutAssessments") {
    return (rows as Doc<"payoutAssessments">[])
      .filter((row) => row.status === "disputed")
      .map((row) => ({
        findingType: "unresolved_dispute",
        resourceType: "payoutAssessment",
        resourceId: String(row._id),
        details: "Legacy payout assessment remains disputed.",
      }));
  }
  if (target === "disputes") {
    return (rows as Doc<"disputes">[])
      .filter((row) => row.state !== "resolved")
      .map((row) => ({
        findingType: "unresolved_dispute",
        resourceType: "dispute",
        resourceId: String(row._id),
        details: `Dispute remains in ${row.state} state.`,
      }));
  }
  return (rows as Doc<"payoutEntries">[])
    .filter((row) => row.source === "purchase" && row.status === "claimed")
    .map((row) => ({
      findingType: "post_claim_purchase",
      resourceType: "payoutEntry",
      resourceId: String(row._id),
      details: "Claimed purchase earning is coupled to the legacy one-time RFS claim flow.",
    }));
};

export const detectLegacyReviewItemsPage = internalMutation({
  args: {
    target: reviewTargetValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: migrationResultValidator,
  handler: async (ctx, args) => {
    let rows: readonly (
      | Doc<"contributions">
      | Doc<"payoutLedger">
      | Doc<"payoutAssessments">
      | Doc<"disputes">
      | Doc<"payoutEntries">
    )[];
    let continueCursor: string;
    let isDone: boolean;
    if (args.target === "contributions") {
      const page = await ctx.db.query("contributions").paginate(args.paginationOpts);
      ({ page: rows, continueCursor, isDone } = page);
    } else if (args.target === "payoutLedger") {
      const page = await ctx.db.query("payoutLedger").paginate(args.paginationOpts);
      ({ page: rows, continueCursor, isDone } = page);
    } else if (args.target === "payoutAssessments") {
      const page = await ctx.db.query("payoutAssessments").paginate(args.paginationOpts);
      ({ page: rows, continueCursor, isDone } = page);
    } else if (args.target === "disputes") {
      const page = await ctx.db.query("disputes").paginate(args.paginationOpts);
      ({ page: rows, continueCursor, isDone } = page);
    } else {
      const page = await ctx.db.query("payoutEntries").paginate(args.paginationOpts);
      ({ page: rows, continueCursor, isDone } = page);
    }

    let changedCount = 0;
    for (const finding of findingsForReviewPage(args.target, rows)) {
      if (await insertReviewFinding(ctx, finding)) {
        changedCount += 1;
      }
    }
    const migrationKey = `legacy-review:${args.target}`;
    await recordProgress(ctx, {
      migrationKey,
      inputCursor: args.paginationOpts.cursor,
      cursor: continueCursor,
      processedCount: rows.length,
      completed: isDone,
    });
    return { migrationKey, processedCount: rows.length, changedCount, continueCursor, isDone };
  },
});

export const ensurePolicyV2FlagOff = internalMutation({
  args: {},
  returns: v.object({ flagId: v.id("featureFlags"), mode: v.literal("off"), created: v.boolean() }),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (query) => query.eq("key", POLICY_V2_FLAG))
      .unique();
    if (existing) {
      if (existing.mode !== "off") {
        throw new Error("policy_v2 already exists in a non-off mode; refusing to downgrade it implicitly.");
      }
      return { flagId: existing._id, mode: "off" as const, created: false };
    }
    const flagId = await ctx.db.insert("featureFlags", {
      key: POLICY_V2_FLAG,
      mode: "off",
      cohortIds: [],
      reason: "Policy v2 remains disabled until inventory, reconciliation, and cohort gates pass.",
      updatedAt: Date.now(),
    });
    return { flagId, mode: "off" as const, created: true };
  },
});
