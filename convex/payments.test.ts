/// <reference types="vite/client" />

import { anyApi } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const TOKEN = "0x20c0000000000000000000000000000000000000";
const SERVER_SECRET = "0123456789abcdef0123456789abcdef";

process.env.OBOE_SERVER_COMMAND_SECRET = SERVER_SECRET;

type TestPaymentCommand = {
  operation: "fund" | "purchase";
  resourceId: string;
  amountBaseUnits: string;
  currencyAddress: string;
  challengeId: string;
  receiptReference: string;
  principalUserId?: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

const canonicalizeTestCommand = (command: TestPaymentCommand) =>
  JSON.stringify([
    "oboe-payment-v1",
    command.operation,
    command.resourceId,
    command.amountBaseUnits,
    command.currencyAddress,
    command.challengeId,
    command.receiptReference,
    command.principalUserId ?? "",
    command.issuedAt,
    command.expiresAt,
    command.nonce,
  ]);

const signTestCommand = async (command: TestPaymentCommand) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SERVER_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(canonicalizeTestCommand(command)),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

type PaymentTestArgs = {
  operation: TestPaymentCommand["operation"];
  resourceId: string;
  amountBaseUnits: bigint;
  currencyAddress: string;
  challengeId: string;
  receiptReference: string;
  principalUserId?: string;
  issuedAt?: number;
  expiresAt?: number;
  nonce?: string;
};

const createTestEnvelope = async (args: PaymentTestArgs) => {
  const issuedAt = args.issuedAt ?? Date.now();
  const command: TestPaymentCommand = {
    operation: args.operation,
    resourceId: args.resourceId,
    amountBaseUnits: args.amountBaseUnits.toString(),
    currencyAddress: args.currencyAddress,
    challengeId: args.challengeId,
    receiptReference: args.receiptReference,
    ...(args.principalUserId ? { principalUserId: args.principalUserId } : {}),
    issuedAt,
    expiresAt: args.expiresAt ?? issuedAt + 30_000,
    nonce: args.nonce ?? `nonce-${args.challengeId}`,
  };
  return { command, signature: await signTestCommand(command) };
};

const recordPayment = async (
  t: TestConvex<typeof schema>,
  args: PaymentTestArgs,
) => t.mutation(anyApi.paymentIngress.record, await createTestEnvelope(args));

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
  it("accepts only an expiring signed ingress and records anonymous identity explicitly", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t);
    const now = Date.now();
    const command: TestPaymentCommand = {
      operation: "fund",
      resourceId: rfsId,
      amountBaseUnits: "10",
      currencyAddress: TOKEN,
      challengeId: "challenge-signed-ingress",
      receiptReference: "0xsigned-ingress",
      issuedAt: now,
      expiresAt: now + 30_000,
      nonce: "nonce-signed-ingress",
    };

    const result = await t.mutation(anyApi.paymentIngress.record, {
      command,
      signature: await signTestCommand(command),
    });

    expect(result).toMatchObject({ operation: "fund" });
    const contribution = await t.run((ctx) =>
      ctx.db.query("contributions").withIndex("by_challengeId", (q) =>
        q.eq("challengeId", command.challengeId),
      ).unique(),
    );
    expect(contribution?.backerUserId).toBeUndefined();
    expect(contribution?.anonymousPaymentReference).toBe(command.challengeId);
  });

  it("returns the original contribution for an exact paid retry", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t);
    const args = {
      operation: "fund" as const,
      resourceId: rfsId,
      amountBaseUnits: BigInt(100),
      currencyAddress: TOKEN,
      challengeId: "challenge-fund-1",
      receiptReference: "0xreceipt1",
    };

    const first = await recordPayment(t, args);
    const retry = await recordPayment(t, args);

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
      operation: "fund" as const,
      resourceId: rfsId,
      amountBaseUnits: BigInt(100),
      currencyAddress: TOKEN,
      challengeId: "challenge-fund-2",
      receiptReference: "0xreceipt2",
    };
    await recordPayment(t, args);

    await expect(
      recordPayment(t, {
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

    await recordPayment(t, {
      operation: "fund",
      resourceId: rfsId,
      amountBaseUnits: BigInt(50),
      currencyAddress: TOKEN,
      challengeId: "challenge-cross-resource",
      receiptReference: "0xshared-receipt",
    });

    await expect(
      recordPayment(t, {
        operation: "purchase",
        resourceId: skillId,
        amountBaseUnits: BigInt(50),
        currencyAddress: TOKEN,
        challengeId: "challenge-cross-resource",
        receiptReference: "0xshared-receipt",
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
      operation: "purchase" as const,
      resourceId: skillId,
      amountBaseUnits: BigInt(50),
      currencyAddress: TOKEN,
      challengeId: "challenge-buy-1",
      receiptReference: "0xreceipt3",
    };

    const first = await recordPayment(t, args);
    const retry = await recordPayment(t, args);

    expect(retry).toEqual(first);
    const state = await t.run(async (ctx) => ({
      purchases: await ctx.db.query("purchases").collect(),
      grants: await ctx.db.query("accessGrants").collect(),
      entries: await ctx.db.query("earningEntries").collect(),
      events: await ctx.db.query("paymentEvents").collect(),
    }));
    expect(state.purchases).toHaveLength(1);
    expect(state.grants).toHaveLength(0);
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
      recordPayment(t, {
        operation: "purchase",
        resourceId: skillId,
        amountBaseUnits: BigInt(49),
        currencyAddress: TOKEN,
        challengeId: "challenge-buy-low",
        receiptReference: "0xreceipt-low",
      }),
    ).rejects.toThrow("INVALID_AMOUNT");

    await expect(
      recordPayment(t, {
        operation: "purchase",
        resourceId: skillId,
        amountBaseUnits: BigInt(50),
        currencyAddress: "0x1111111111111111111111111111111111111111",
        challengeId: "challenge-buy-token",
        receiptReference: "0xreceipt-token",
      }),
    ).rejects.toThrow("INVALID_CURRENCY");
  });

  it("rejects unsigned, tampered, and expired payment commands", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t);
    const baseArgs = {
      operation: "fund" as const,
      resourceId: rfsId,
      amountBaseUnits: BigInt(10),
      currencyAddress: TOKEN,
      challengeId: "challenge-untrusted",
      receiptReference: "0xreceipt-untrusted",
    };
    const envelope = await createTestEnvelope(baseArgs);

    await expect(
      t.mutation(anyApi.paymentIngress.record, {
        ...envelope,
        signature: "0".repeat(64),
      }),
    ).rejects.toThrow("INVALID_COMMAND");
    await expect(
      t.mutation(anyApi.paymentIngress.record, {
        command: { ...envelope.command, amountBaseUnits: "11" },
        signature: envelope.signature,
      }),
    ).rejects.toThrow("INVALID_COMMAND");

    const expiredAt = Date.now() - 1_000;
    await expect(
      recordPayment(t, {
        ...baseArgs,
        challengeId: "challenge-expired",
        issuedAt: expiredAt - 30_000,
        expiresAt: expiredAt,
      }),
    ).rejects.toThrow("INVALID_COMMAND");
  });

  it("attributes a verified browser payment handoff to its signed-in user", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await insertRfs(t);

    await recordPayment(t, {
      operation: "fund",
      resourceId: rfsId,
      amountBaseUnits: BigInt(10),
      currencyAddress: TOKEN,
      challengeId: "challenge-browser",
      receiptReference: "0xreceipt-browser",
      principalUserId: "user-browser",
    });

    const contribution = await t.run((ctx) =>
      ctx.db.query("contributions").withIndex("by_challengeId", (query) =>
        query.eq("challengeId", "challenge-browser"),
      ).unique(),
    );
    expect(contribution?.backerUserId).toBe("user-browser");
    expect(contribution?.anonymousPaymentReference).toBeUndefined();
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
    const detail = await t.query(anyApi.skills.getBySkill, { skillId });

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

    const purchase = await recordPayment(t, {
      operation: "purchase",
      resourceId: skillId,
      amountBaseUnits: BigInt(50),
      currencyAddress: TOKEN,
      challengeId: "challenge-one-shot",
      receiptReference: "0xreceipt-one-shot",
    });

    expect(purchase).toMatchObject({
      operation: "purchase",
      contentMarkdown: "# Paid result",
    });
  });
});
