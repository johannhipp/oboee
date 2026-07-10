import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export const signServerEnvelope = (secret: string, payload: string) => {
  if (secret.length < 32) {
    throw new Error("Server envelope secret must contain at least 32 characters.");
  }
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(payload)));
};

export const verifyServerEnvelope = (secret: string, payload: string, signature: string) => {
  const expected = signServerEnvelope(secret, payload);
  if (signature.length !== expected.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return difference === 0;
};
