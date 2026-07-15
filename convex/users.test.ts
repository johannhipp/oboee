/// <reference types="vite/client" />

import { anyApi } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import {
  sumUnsettledTestnetEarningsBaseUnits,
} from "./users";
import {
  normalizePayoutWalletAddress,
  savePayoutWalletPreference,
} from "./lib/wallet";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("payout wallet validation", () => {
  it("normalizes a valid address and rejects invalid or zero addresses", () => {
    expect(
      normalizePayoutWalletAddress(" 0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD "),
    ).toBe("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
    expect(() => normalizePayoutWalletAddress("not-an-address")).toThrow(
      "INVALID_WALLET_ADDRESS",
    );
    expect(() =>
      normalizePayoutWalletAddress("0x0000000000000000000000000000000000000000"),
    ).toThrow("INVALID_WALLET_ADDRESS");
  });

  it("includes every immutable earning in the unsettled testnet total", () => {
    expect(
      sumUnsettledTestnetEarningsBaseUnits([
        { netAmountBaseUnits: BigInt(990) },
        { netAmountBaseUnits: BigInt(495) },
      ]),
    ).toBe(BigInt(1_485));
  });

  it("rejects unauthenticated writes and keeps one normalized row per user", async () => {
    const t = convexTest({ schema, modules });
    await expect(
      t.mutation(anyApi.users.updateWallet, {
        walletAddress: "0x1111111111111111111111111111111111111111",
      }),
    ).rejects.toThrow("UNAUTHORIZED");

    await t.run((ctx) =>
      savePayoutWalletPreference(
        ctx,
        "user-1",
        "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
      ),
    );
    await t.run((ctx) =>
      savePayoutWalletPreference(
        ctx,
        "user-1",
        "0x1111111111111111111111111111111111111111",
      ),
    );
    const rows = await t.run((ctx) => ctx.db.query("payoutWallets").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].walletAddress).toBe(
      "0x1111111111111111111111111111111111111111",
    );
  });
});
