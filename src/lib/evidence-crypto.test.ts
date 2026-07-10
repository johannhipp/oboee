import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decryptEvidence, encryptEvidence, type EvidenceKeyProvider } from "./evidence-crypto";

const fakeProvider = (): EvidenceKeyProvider => {
  const wrappingKey = randomBytes(32);
  return {
    wrapKey: async (rawKey) => {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", wrappingKey, nonce);
      const encrypted = Buffer.concat([cipher.update(rawKey), cipher.final()]);
      return { wrappedDataKey: Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64"), keyVersion: "test-v1" };
    },
    unwrapKey: async (wrapped, version) => {
      if (version !== "test-v1") throw new Error("wrong key version");
      const bytes = Buffer.from(wrapped, "base64");
      const decipher = createDecipheriv("aes-256-gcm", wrappingKey, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return new Uint8Array(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]));
    },
  };
};

describe("evidence encryption", () => {
  it("round-trips through an external wrapping provider", async () => {
    const provider = fakeProvider();
    const plaintext = new TextEncoder().encode("restricted reproduction transcript");
    const encrypted = await encryptEvidence(plaintext, provider);
    expect(encrypted.ciphertext).not.toEqual(plaintext);
    expect(await decryptEvidence(encrypted, provider)).toEqual(plaintext);
  });

  it("fails closed for ciphertext tampering and wrong key versions", async () => {
    const provider = fakeProvider();
    const encrypted = await encryptEvidence(new TextEncoder().encode("proof"), provider);
    encrypted.ciphertext[0] ^= 1;
    await expect(decryptEvidence(encrypted, provider)).rejects.toThrow();
    await expect(decryptEvidence({ ...encrypted, kmsKeyVersion: "wrong" }, provider)).rejects.toThrow("wrong key version");
  });
});
