/// <reference types="vite/client" />

import { anyApi } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const TOKEN = "0x20c0000000000000000000000000000000000000";
const SERVER_SECRET = "0123456789abcdef0123456789abcdef";

process.env.OBOE_PAYMENT_RECORDING_SECRET = SERVER_SECRET;

const insertRfs = async (
  t: TestConvex<typeof schema>,
  overrides: Partial<{
    currentAmountBaseUnits: bigint;
    fundingThresholdBaseUnits: bigint;
    status: "open" | "funded" | "published";
  }> = {},
) =>
  await t.run(async (ctx) =>
    await ctx.db.insert("rfs", {
      authorUserId: "author",
      title: "Focused request",
      description: "A useful description",
      scope: "A bounded scope",
      tags: ["test"],
      fundingThresholdBaseUnits: overrides.fundingThresholdBaseUnits ?? BigInt(100),
      minimumContributionBaseUnits: BigInt(1),
      currentAmountBaseUnits: overrides.currentAmountBaseUnits ?? BigInt(0),
      fundingTokenAddress: TOKEN,
      status: overrides.status ?? "open",
    }),
  );

describe("payment recording", () => {
  it("returns the original contribution for an exact paid retry", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t);
    const args = {
      rfsId,
      amountBaseUnits: BigInt(100),
      currencyAddress: TOKEN,
      challengeId: "challenge-fund-1",
      receiptReference: "0xreceipt1",
      serverSecret: SERVER_SECRET,
    };

    const first = await t.mutation(anyApi.contributions.recordContribution, args);
    const retry = await t.mutation(anyApi.contributions.recordContribution, args);

    expect(retry).toEqual(first);
    const state = await t.run(async (ctx) => ({
      rfs: await ctx.db.get(rfsId),
      contributions: await ctx.db.query("contributions").collect(),
      events: await ctx.db.query("paymentEvents").collect(),
    }));
    expect(state.rfs?.currentAmountBaseUnits).toBe(BigInt(100));
    expect(state.rfs?.status).toBe("funded");
    expect(state.contributions).toHaveLength(1);
    expect(state.events).toHaveLength(1);
  });

  it("rejects a reused contribution challenge with changed payment facts", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t, { fundingThresholdBaseUnits: BigInt(1_000) });
    const args = {
      rfsId,
      amountBaseUnits: BigInt(100),
      currencyAddress: TOKEN,
      challengeId: "challenge-fund-2",
      receiptReference: "0xreceipt2",
      serverSecret: SERVER_SECRET,
    };
    await t.mutation(anyApi.contributions.recordContribution, args);

    await expect(
      t.mutation(anyApi.contributions.recordContribution, {
        ...args,
        amountBaseUnits: BigInt(101),
      }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("rejects replaying one paid challenge across funding and purchase", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t, { fundingThresholdBaseUnits: BigInt(1_000) });
    const skillId = await t.run(async (ctx) =>
      await ctx.db.insert("skills", {
        rfsId,
        authorUserId: "author",
        contentMarkdown: "# Full content",
        summary: "Summary",
        tags: ["test"],
        purchasePriceBaseUnits: BigInt(50),
        status: "published",
      }),
    );

    await t.mutation(anyApi.contributions.recordContribution, {
      rfsId,
      amountBaseUnits: BigInt(50),
      currencyAddress: TOKEN,
      challengeId: "challenge-cross-resource",
      receiptReference: "0xshared-receipt",
      serverSecret: SERVER_SECRET,
    });

    await expect(
      t.mutation(anyApi.purchases.recordPurchase, {
        skillId,
        amountBaseUnits: BigInt(50),
        currencyAddress: TOKEN,
        challengeId: "challenge-cross-resource",
        receiptReference: "0xshared-receipt",
        serverSecret: SERVER_SECRET,
      }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("returns the original purchase for an exact paid retry without duplicate grants", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t, {
      currentAmountBaseUnits: BigInt(100),
      status: "published",
    });
    const skillId = await t.run(async (ctx) =>
      await ctx.db.insert("skills", {
        rfsId,
        authorUserId: "author",
        contentMarkdown: "# Full content",
        summary: "Summary",
        tags: ["test"],
        purchasePriceBaseUnits: BigInt(50),
        status: "published",
      }),
    );
    const args = {
      skillId,
      amountBaseUnits: BigInt(50),
      currencyAddress: TOKEN,
      challengeId: "challenge-buy-1",
      receiptReference: "0xreceipt3",
      serverSecret: SERVER_SECRET,
    };

    const first = await t.mutation(anyApi.purchases.recordPurchase, args);
    const retry = await t.mutation(anyApi.purchases.recordPurchase, args);

    expect(retry).toEqual(first);
    const state = await t.run(async (ctx) => ({
      purchases: await ctx.db.query("purchases").collect(),
      grants: await ctx.db.query("accessGrants").collect(),
      entries: await ctx.db.query("payoutEntries").collect(),
      events: await ctx.db.query("paymentEvents").collect(),
    }));
    expect(state.purchases).toHaveLength(1);
    expect(state.grants).toHaveLength(1);
    expect(state.entries).toHaveLength(1);
    expect(state.events).toHaveLength(1);
  });

  it("rejects purchases whose amount or token differs from the listing", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t, { status: "published" });
    const skillId = await t.run(async (ctx) =>
      await ctx.db.insert("skills", {
        rfsId,
        authorUserId: "author",
        contentMarkdown: "# Full content",
        summary: "Summary",
        tags: [],
        purchasePriceBaseUnits: BigInt(50),
        status: "published",
      }),
    );

    await expect(
      t.mutation(anyApi.purchases.recordPurchase, {
        skillId,
        amountBaseUnits: BigInt(49),
        currencyAddress: TOKEN,
        challengeId: "challenge-buy-low",
        receiptReference: "0xreceipt-low",
        serverSecret: SERVER_SECRET,
      }),
    ).rejects.toThrow("INVALID_AMOUNT");

    await expect(
      t.mutation(anyApi.purchases.recordPurchase, {
        skillId,
        amountBaseUnits: BigInt(50),
        currencyAddress: "0x1111111111111111111111111111111111111111",
        challengeId: "challenge-buy-token",
        receiptReference: "0xreceipt-token",
        serverSecret: SERVER_SECRET,
      }),
    ).rejects.toThrow("INVALID_CURRENCY");
  });

  it("rejects direct payment-recording calls without the server secret", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t);

    await expect(
      t.mutation(anyApi.contributions.recordContribution, {
        rfsId,
        amountBaseUnits: BigInt(10),
        currencyAddress: TOKEN,
        challengeId: "challenge-untrusted",
        receiptReference: "0xreceipt-untrusted",
        serverSecret: "wrong",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("attributes a verified browser payment handoff to its signed-in user", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t);

    const result = await t.mutation(anyApi.contributions.recordContribution, {
      rfsId,
      amountBaseUnits: BigInt(10),
      currencyAddress: TOKEN,
      challengeId: "challenge-browser",
      receiptReference: "0xreceipt-browser",
      principalUserId: "user-browser",
      serverSecret: SERVER_SECRET,
    });

    expect(result.backerUserId).toBe("user-browser");
  });

  it("treats malformed and wrong-table public IDs as not found", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t);

    await expect(
      t.query(anyApi.rfs.getPublic, { rfsId: "not-a-convex-id" }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      t.query(anyApi.purchases.checkAccess, { skillId: rfsId }),
    ).resolves.toEqual({ hasAccess: false, skill: null });
  });

  it("never exposes paid Markdown through public metadata queries", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t, { status: "published" });
    const skillId = await t.run(async (ctx) =>
      await ctx.db.insert("skills", {
        rfsId,
        authorUserId: "author",
        contentMarkdown: "# This must stay paid",
        summary: "Public summary",
        tags: ["security"],
        purchasePriceBaseUnits: BigInt(50),
        status: "published",
      }),
    );

    const access = await t.query(anyApi.purchases.checkAccess, { skillId });
    const detail = await t.query(anyApi.skills.get, { skillId });

    expect(access.hasAccess).toBe(false);
    expect(access.skill).not.toHaveProperty("contentMarkdown");
    expect(detail.skill).not.toHaveProperty("contentMarkdown");
    await expect(
      t.query(anyApi.purchases.readEntitledContent, { skillId }),
    ).resolves.toBeNull();
  });

  it("returns one-shot content only from a server-verified purchase", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t, { status: "published" });
    const skillId = await t.run(async (ctx) =>
      await ctx.db.insert("skills", {
        rfsId,
        authorUserId: "author",
        contentMarkdown: "# Paid result",
        summary: "Public summary",
        tags: [],
        purchasePriceBaseUnits: BigInt(50),
        status: "published",
      }),
    );

    const purchase = await t.mutation(anyApi.purchases.recordPurchase, {
      skillId,
      amountBaseUnits: BigInt(50),
      currencyAddress: TOKEN,
      challengeId: "challenge-one-shot",
      receiptReference: "0xreceipt-one-shot",
      serverSecret: SERVER_SECRET,
    });

    expect(purchase.contentMarkdown).toBe("# Paid result");
  });
});
