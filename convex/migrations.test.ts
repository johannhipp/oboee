/// <reference types="vite/client" />

import { anyApi } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const page = (cursor: string | null = null, numItems = 100) => ({ cursor, numItems });

const insertRfs = async (
  t: TestConvex<typeof schema>,
  overrides: Partial<{
    title: string;
    status: "open" | "funded" | "published";
    currentAmountBaseUnits: bigint;
    policyVersion: number;
  }> = {},
) =>
  await t.run((ctx) =>
    ctx.db.insert("rfs", {
      authorUserId: "user:requester",
      title: overrides.title ?? "Legacy request",
      description: "Legacy description",
      scope: "Legacy scope",
      tags: ["legacy"],
      fundingThresholdBaseUnits: BigInt(1_000),
      minimumContributionBaseUnits: BigInt(10),
      currentAmountBaseUnits: overrides.currentAmountBaseUnits ?? BigInt(0),
      fundingTokenAddress: "0xtoken",
      status: overrides.status ?? "open",
      policyVersion: overrides.policyVersion,
    }),
  );

describe("migration inventory", () => {
  it("returns exact status totals without writing any rows", async () => {
    const t = convexTest({ schema, modules });
    await insertRfs(t, { status: "open", currentAmountBaseUnits: BigInt(125) });
    await insertRfs(t, { status: "funded", currentAmountBaseUnits: BigInt(1_000) });
    const before = await t.run(async (ctx) => ({
      rfs: await ctx.db.query("rfs").collect(),
      progress: await ctx.db.query("migrationProgress").collect(),
    }));

    const result = await t.query(anyApi.migrations.inventoryLegacyPage, {
      target: "rfs",
      paginationOpts: page(),
    });

    expect(result.isDone).toBe(true);
    expect(result.buckets).toEqual([
      {
        status: "funded",
        count: 1,
        primaryAmountBaseUnits: BigInt(1_000),
        secondaryAmountBaseUnits: BigInt(1_000),
      },
      {
        status: "open",
        count: 1,
        primaryAmountBaseUnits: BigInt(125),
        secondaryAmountBaseUnits: BigInt(1_000),
      },
    ]);
    const after = await t.run(async (ctx) => ({
      rfs: await ctx.db.query("rfs").collect(),
      progress: await ctx.db.query("migrationProgress").collect(),
    }));
    expect(after).toEqual(before);
  });
});

describe("policy migration", () => {
  it("backfills bounded pages, records progress, and is idempotent", async () => {
    const t = convexTest({ schema, modules });
    await insertRfs(t, { title: "First" });
    await insertRfs(t, { title: "Second" });

    const first = await t.mutation(anyApi.migrations.backfillLegacyPolicyPage, {
      target: "rfs",
      paginationOpts: page(null, 1),
    });
    expect(first.processedCount).toBe(1);
    expect(first.isDone).toBe(false);

    const second = await t.mutation(anyApi.migrations.backfillLegacyPolicyPage, {
      target: "rfs",
      paginationOpts: page(first.continueCursor, 1),
    });
    expect(second.processedCount).toBe(1);
    expect(second.isDone).toBe(true);

    const rerun = await t.mutation(anyApi.migrations.backfillLegacyPolicyPage, {
      target: "rfs",
      paginationOpts: page(),
    });
    expect(rerun.changedCount).toBe(0);

    const state = await t.run(async (ctx) => ({
      rows: await ctx.db.query("rfs").collect(),
      progress: await ctx.db
        .query("migrationProgress")
        .withIndex("by_migrationKey", (query) => query.eq("migrationKey", "policy-v1:rfs"))
        .unique(),
    }));
    expect(state.rows.map((row) => row.policyVersion)).toEqual([1, 1]);
    expect(state.progress).toMatchObject({ processedCount: 2, completed: true, version: 2 });
  });
});

describe("legacy skill-version migration", () => {
  it("copies only known skill facts and does not invent evaluation outcomes", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t, { status: "published" });
    const skillId = await t.run((ctx) =>
      ctx.db.insert("skills", {
        rfsId,
        authorUserId: "user:author",
        contentMarkdown: "# Known legacy content",
        summary: "Known summary",
        tags: ["legacy"],
        purchasePriceBaseUnits: BigInt(75),
        status: "published",
      }),
    );

    const migrated = await t.mutation(anyApi.migrations.backfillMissingSkillVersionsPage, {
      paginationOpts: page(),
    });
    expect(migrated.changedCount).toBe(1);
    const rerun = await t.mutation(anyApi.migrations.backfillMissingSkillVersionsPage, {
      paginationOpts: page(),
    });
    expect(rerun.changedCount).toBe(0);

    const state = await t.run(async (ctx) => ({
      skill: await ctx.db.get(skillId),
      versions: await ctx.db
        .query("skillVersions")
        .withIndex("by_skill", (query) => query.eq("skillId", skillId))
        .collect(),
      evaluations: await ctx.db.query("evaluationEvents").collect(),
      assessments: await ctx.db.query("payoutAssessments").collect(),
      reviewItems: await ctx.db.query("migrationReviewItems").collect(),
    }));
    expect(state.versions).toHaveLength(1);
    expect(state.versions[0]).toMatchObject({
      contentMarkdown: "# Known legacy content",
      policyVersion: 1,
      digestAlgorithm: "legacy_fnv1a64",
      legacyImported: true,
    });
    expect(state.skill?.publishedVersionId).toBe(state.versions[0]._id);
    expect(state.evaluations).toHaveLength(0);
    expect(state.assessments).toHaveLength(0);
    expect(state.reviewItems).toHaveLength(1);
  });
});

describe("legacy review queue", () => {
  it("detects risky legacy facts once", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t, { status: "published" });
    await t.run(async (ctx) => {
      await ctx.db.insert("contributions", {
        rfsId,
        backerUserId: "agent:legacy-challenge",
        amountBaseUnits: BigInt(100),
        currencyAddress: "0xtoken",
        challengeId: "challenge",
        receiptReference: "receipt",
        status: "accepted",
      });
      await ctx.db.insert("payoutLedger", {
        rfsId,
        researcherUserId: "user:author",
        grossAmountBaseUnits: BigInt(100),
        platformFeeBaseUnits: BigInt(1),
        netAmountBaseUnits: BigInt(99),
        status: "claimed",
      });
      await ctx.db.insert("payoutEntries", {
        rfsId,
        researcherUserId: "user:author",
        source: "purchase",
        grossAmountBaseUnits: BigInt(50),
        platformFeeBaseUnits: BigInt(0),
        netAmountBaseUnits: BigInt(50),
        status: "claimed",
        claimGroupId: "legacy-claim",
      });
    });

    for (const target of ["contributions", "payoutLedger", "payoutEntries"] as const) {
      const first = await t.mutation(anyApi.migrations.detectLegacyReviewItemsPage, {
        target,
        paginationOpts: page(),
      });
      expect(first.changedCount).toBe(1);
      const second = await t.mutation(anyApi.migrations.detectLegacyReviewItemsPage, {
        target,
        paginationOpts: page(),
      });
      expect(second.changedCount).toBe(0);
    }

    const findings = await t.run((ctx) => ctx.db.query("migrationReviewItems").collect());
    expect(findings.map((finding) => finding.findingType).sort()).toEqual([
      "claimed_without_receipt",
      "post_claim_purchase",
      "synthetic_principal",
    ]);
  });
});

describe("policy v2 feature flag", () => {
  it("is created off and never duplicated", async () => {
    const t = convexTest({ schema, modules });
    const first = await t.mutation(anyApi.migrations.ensurePolicyV2FlagOff, {});
    const second = await t.mutation(anyApi.migrations.ensurePolicyV2FlagOff, {});
    expect(first).toMatchObject({ mode: "off", created: true });
    expect(second).toMatchObject({ flagId: first.flagId, mode: "off", created: false });
    const flags = await t.run((ctx) => ctx.db.query("featureFlags").collect());
    expect(flags).toHaveLength(1);
  });
});
