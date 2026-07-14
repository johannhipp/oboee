/// <reference types="vite/client" />

import { anyApi } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import { skillCapabilities } from "../src/lib/api-v2/capabilities";
import { fallbackAuthorHandle } from "./lib/publicIdentity";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const insertLegacyPublishedSkill = async (t: TestConvex<typeof schema>) =>
  await t.run(async (ctx) => {
    const now = Date.now();
    const rfsId = await ctx.db.insert("rfs", {
      authorUserId: "user:legacy-author",
      title: "Legacy request",
      description: "Imported request",
      scope: "Imported scope",
      tags: ["legacy"],
      fundingThresholdBaseUnits: BigInt(1_000),
      minimumContributionBaseUnits: BigInt(100),
      currentAmountBaseUnits: BigInt(1_000),
      fundingTokenAddress: "0xtoken",
      status: "published",
      policyVersion: 1,
    });
    const skillId = await ctx.db.insert("skills", {
      rfsId,
      authorUserId: "user:legacy-author",
      contentMarkdown: "# Imported content",
      summary: "Imported summary",
      tags: ["legacy"],
      purchasePriceBaseUnits: BigInt(75),
      status: "published",
      policyVersion: 1,
      quarantineState: "clear",
    });
    const versionId = await ctx.db.insert("skillVersions", {
      skillId,
      rfsId,
      version: 1,
      contentHash: "fnv1a64:legacy",
      contentMarkdown: "# Imported content",
      summary: "Imported summary",
      tags: ["legacy"],
      purchasePriceBaseUnits: BigInt(75),
      authorUserId: "user:legacy-author",
      status: "published",
      submittedAt: now - 1_000,
      evaluationDeadline: now - 500,
      publishedAt: now - 250,
      policyVersion: 1,
      digestAlgorithm: "legacy_fnv1a64",
      quarantineState: "clear",
      legacyImported: true,
    });
    await ctx.db.patch(skillId, {
      publishedVersionId: versionId,
      latestVersion: 1,
      latestContentHash: "fnv1a64:legacy",
    });
    return { skillId, versionId };
  });

describe("public skill details", () => {
  it("serves imported legacy skills as explicitly read-only public data", async () => {
    const t = convexTest({ schema, modules });
    const { skillId, versionId } = await insertLegacyPublishedSkill(t);

    const result = await t.query(anyApi.skills.getPublic, { skillId });

    expect(result).toMatchObject({
      skillId,
      skillVersionId: versionId,
      policyVersion: 1,
      legacyImported: true,
    });

    const refreshed = await t.mutation(anyApi.reputation.refreshDiscovery, {});
    expect(refreshed.refreshed).toBe(1);
    const projection = await t.run((ctx) => ctx.db.query("discoveryProjection").unique());
    expect(projection).toMatchObject({ skillId, skillVersionId: versionId, policyVersion: 1, algorithmVersion: 2 });
    expect(skillCapabilities(String(skillId), String(versionId), true, false).find((item) => item.action === "purchase")).toMatchObject({ allowed: false });
  });

  it("resolves a deterministic public author fallback for imported records", async () => {
    const t = convexTest({ schema, modules });
    await insertLegacyPublishedSkill(t);

    const author = await t.query(anyApi.reputation.publicAuthor, { handle: fallbackAuthorHandle("user:legacy-author") });

    expect(author).toMatchObject({ handle: fallbackAuthorHandle("user:legacy-author"), publishedSkills: [{ summary: "Imported summary" }] });
  });
});
