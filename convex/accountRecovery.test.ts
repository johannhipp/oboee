/// <reference types="vite/client" />

import { anyApi } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const insertWallet = async (t: TestConvex<typeof schema>, principalId: string, address: string) =>
  await t.run((ctx) => ctx.db.insert("principalWallets", {
    principalId,
    chain: "tempo",
    address,
    verificationChallenge: "challenge",
    verificationDigest: "digest",
    verifiedAt: Date.now(),
    primary: true,
    status: "active",
  }));

describe("account recovery idempotency", () => {
  it("replays the same challenge and rejects key reuse with a different wallet", async () => {
    const t = convexTest({ schema, modules });
    const principalId = "principal:recovery-test";
    const walletId = await insertWallet(t, principalId, "0x1111111111111111111111111111111111111111");
    const otherWalletId = await insertWallet(t, principalId, "0x2222222222222222222222222222222222222222");
    const input = { principalId, walletId, idempotencyKey: "recovery-challenge-key" };

    const first = await t.mutation(anyApi.accountRecovery.createRecoveryChallenge, input);
    const replay = await t.mutation(anyApi.accountRecovery.createRecoveryChallenge, input);

    expect(replay).toEqual(first);
    await expect(t.mutation(anyApi.accountRecovery.createRecoveryChallenge, { ...input, walletId: otherWalletId })).rejects.toThrow("IDEMPOTENCY_CONFLICT");

    const records = await t.run((ctx) => ctx.db.query("idempotencyRecords").collect());
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ action: "recovery.create_challenge", state: "completed", idempotencyKey: input.idempotencyKey });
  });
});
