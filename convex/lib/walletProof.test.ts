import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import {
  createWalletVerificationMessage,
  normalizeEvmAddress,
  verifyWalletSignature,
  walletMessageDigest,
} from "./walletProof";

const account = privateKeyToAccount(generatePrivateKey());

describe("wallet proof", () => {
  it("verifies only the exact SIWE message signed by the requested wallet", async () => {
    const message = createWalletVerificationMessage({
      address: account.address,
      chainId: 1,
      domain: "oboe.test",
      nonce: "challenge1234",
      uri: "https://oboe.test",
      issuedAt: new Date("2026-01-01T00:00:00Z"),
      expirationTime: new Date("2026-01-01T00:10:00Z"),
    });
    const signature = await account.signMessage({ message });
    await expect(
      verifyWalletSignature({ address: account.address, message, signature }),
    ).resolves.toBe(true);
    await expect(
      verifyWalletSignature({ address: account.address, message: `${message}\nchanged`, signature }),
    ).resolves.toBe(false);
  });

  it("normalizes checksums and produces a stable message digest", () => {
    expect(normalizeEvmAddress(account.address.toLowerCase())).toBe(account.address);
    expect(walletMessageDigest("proof")).toBe(walletMessageDigest("proof"));
    expect(walletMessageDigest("proof")).not.toBe(walletMessageDigest("other"));
  });

  it("rejects malformed signatures at the boundary", async () => {
    await expect(
      verifyWalletSignature({ address: account.address, message: "proof", signature: "invalid" }),
    ).resolves.toBe(false);
  });
});
