import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
};

export const canonicalJson = (value: unknown) => JSON.stringify(canonicalize(value));

export const sha256Digest = (value: unknown) =>
  bytesToHex(sha256(utf8ToBytes(typeof value === "string" ? value : canonicalJson(value))));
