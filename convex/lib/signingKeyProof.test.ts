import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { describe, expect, it } from "vitest";

describe("proof signing keys", () => {
  it("verifies exact Ed25519 challenge bytes and rejects altered payloads", () => {
    const privateKey = new Uint8Array(32).fill(7);
    const publicKey = ed25519.getPublicKey(privateKey);
    const challenge = utf8ToBytes("oboe-proof-key-challenge");
    const signature = ed25519.sign(challenge, privateKey);
    expect(ed25519.verify(signature, challenge, publicKey, { zip215: false })).toBe(true);
    expect(ed25519.verify(signature, utf8ToBytes("altered"), publicKey, { zip215: false })).toBe(false);
    expect(bytesToHex(publicKey)).toHaveLength(64);
  });
});
