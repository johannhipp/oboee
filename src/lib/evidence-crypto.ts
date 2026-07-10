import { createHash, randomBytes, webcrypto } from "node:crypto";

export interface WrappedKey {
  wrappedDataKey: string;
  keyVersion: string;
}

export interface EvidenceKeyProvider {
  wrapKey: (rawKey: Uint8Array) => Promise<WrappedKey>;
  unwrapKey: (wrappedKey: string, keyVersion: string) => Promise<Uint8Array>;
}

export interface EncryptedEvidence {
  ciphertext: Uint8Array;
  plaintextSha256: string;
  ciphertextSha256: string;
  wrappedDataKey: string;
  kmsKeyVersion: string;
  nonce: string;
  authenticationTag: string;
}

const sha256 = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

export const encryptEvidence = async (
  plaintext: Uint8Array,
  provider: EvidenceKeyProvider,
): Promise<EncryptedEvidence> => {
  const rawKey = randomBytes(32);
  const nonce = randomBytes(12);
  const key = await webcrypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await webcrypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, plaintext),
  );
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const authenticationTag = encrypted.subarray(encrypted.length - 16);
  const wrapped = await provider.wrapKey(rawKey);
  rawKey.fill(0);
  return {
    ciphertext,
    plaintextSha256: sha256(plaintext),
    ciphertextSha256: sha256(ciphertext),
    wrappedDataKey: wrapped.wrappedDataKey,
    kmsKeyVersion: wrapped.keyVersion,
    nonce: nonce.toString("base64"),
    authenticationTag: Buffer.from(authenticationTag).toString("base64"),
  };
};

export const decryptEvidence = async (
  encrypted: Pick<EncryptedEvidence, "ciphertext" | "wrappedDataKey" | "kmsKeyVersion" | "nonce" | "authenticationTag" | "plaintextSha256">,
  provider: EvidenceKeyProvider,
) => {
  const rawKey = await provider.unwrapKey(encrypted.wrappedDataKey, encrypted.kmsKeyVersion);
  try {
    const key = await webcrypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
    const ciphertextAndTag = Buffer.concat([
      Buffer.from(encrypted.ciphertext),
      Buffer.from(encrypted.authenticationTag, "base64"),
    ]);
    const plaintext = new Uint8Array(
      await webcrypto.subtle.decrypt(
        { name: "AES-GCM", iv: Buffer.from(encrypted.nonce, "base64"), tagLength: 128 },
        key,
        ciphertextAndTag,
      ),
    );
    if (sha256(plaintext) !== encrypted.plaintextSha256) {
      throw new Error("Evidence plaintext hash mismatch.");
    }
    return plaintext;
  } finally {
    rawKey.fill(0);
  }
};

export const createRemoteKmsProvider = (): EvidenceKeyProvider => {
  const baseUrl = process.env.OBOE_KMS_URL?.replace(/\/$/, "");
  const token = process.env.OBOE_KMS_AUTH_TOKEN;
  if (!baseUrl || !token) {
    throw new Error("OBOE_KMS_URL and OBOE_KMS_AUTH_TOKEN are required for evidence encryption.");
  }
  const request = async (path: string, body: object) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Evidence KMS request failed with ${response.status}.`);
    return await response.json() as Record<string, unknown>;
  };
  return {
    wrapKey: async (rawKey) => {
      const result = await request("/v1/wrap", { plaintextKey: Buffer.from(rawKey).toString("base64") });
      if (typeof result.wrappedDataKey !== "string" || typeof result.keyVersion !== "string") throw new Error("Evidence KMS returned an invalid wrap response.");
      return { wrappedDataKey: result.wrappedDataKey, keyVersion: result.keyVersion };
    },
    unwrapKey: async (wrappedKey, keyVersion) => {
      const result = await request("/v1/unwrap", { wrappedDataKey: wrappedKey, keyVersion });
      if (typeof result.plaintextKey !== "string") throw new Error("Evidence KMS returned an invalid unwrap response.");
      const decoded = Buffer.from(result.plaintextKey, "base64");
      if (decoded.length !== 32) throw new Error("Evidence KMS returned an invalid data key.");
      return new Uint8Array(decoded);
    },
  };
};
