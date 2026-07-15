const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
export const ZERO_EVM_ADDRESS =
  "0x0000000000000000000000000000000000000000";

export const normalizeTags = (tags: readonly string[]) =>
  Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  );

export const normalizeEvmAddress = (rawValue: string): `0x${string}` | null => {
  const value = rawValue.trim();
  if (!EVM_ADDRESS_PATTERN.test(value)) {
    return null;
  }
  const normalized = value.toLowerCase() as `0x${string}`;
  return normalized === ZERO_EVM_ADDRESS ? null : normalized;
};
