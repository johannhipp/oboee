export const TOKEN_DECIMALS = 6;
export const TOKEN_SCALE = BigInt(10) ** BigInt(TOKEN_DECIMALS);
export const MAX_MVP_PAYMENT_BASE_UNITS = BigInt(9_000);

const BASE_UNIT_PATTERN = /^-?\d+$/;
const DECIMAL_PATTERN = /^(0|[1-9]\d*)(?:\.(\d+))?$/;

export const parseTokenAmount = (rawValue: string): bigint | null => {
  const value = rawValue.trim();
  const match = DECIMAL_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const fraction = match[2] ?? "";
  if (fraction.length > TOKEN_DECIMALS) {
    return null;
  }

  return (
    BigInt(match[1]) * TOKEN_SCALE +
    BigInt(fraction.padEnd(TOKEN_DECIMALS, "0") || "0")
  );
};

export const parsePositiveBaseUnits = (rawValue: string): bigint | null => {
  const value = rawValue.trim();
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = BigInt(value);
  return parsed > BigInt(0) ? parsed : null;
};

type FormatTokenOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export const formatTokenBaseUnits = (
  rawValue: bigint | string,
  options: FormatTokenOptions = {},
) => {
  if (typeof rawValue === "string" && !BASE_UNIT_PATTERN.test(rawValue)) {
    throw new TypeError("Token base units must be an integer string.");
  }
  const value = typeof rawValue === "bigint" ? rawValue : BigInt(rawValue);
  const minimumFractionDigits = Math.min(
    TOKEN_DECIMALS,
    Math.max(0, options.minimumFractionDigits ?? 2),
  );
  const maximumFractionDigits = Math.min(
    TOKEN_DECIMALS,
    Math.max(minimumFractionDigits, options.maximumFractionDigits ?? TOKEN_DECIMALS),
  );
  const absoluteValue = value < BigInt(0) ? -value : value;
  const whole = absoluteValue / TOKEN_SCALE;
  let fraction = (absoluteValue % TOKEN_SCALE)
    .toString()
    .padStart(TOKEN_DECIMALS, "0")
    .slice(0, maximumFractionDigits);

  while (
    fraction.length > minimumFractionDigits &&
    fraction.endsWith("0")
  ) {
    fraction = fraction.slice(0, -1);
  }

  const sign = value < BigInt(0) ? "-" : "";
  return fraction
    ? `${sign}${whole.toString()}.${fraction}`
    : `${sign}${whole.toString()}`;
};

export const isMvpPaymentBaseUnits = (value: bigint) =>
  value >= BigInt(1) && value <= MAX_MVP_PAYMENT_BASE_UNITS;

export const splitPlatformFee = (grossAmountBaseUnits: bigint) => {
  const platformFeeBaseUnits = grossAmountBaseUnits / BigInt(100);
  const netAmountBaseUnits = grossAmountBaseUnits - platformFeeBaseUnits;
  return { platformFeeBaseUnits, netAmountBaseUnits };
};

export const progressPercent = (current: bigint, threshold: bigint) => {
  if (threshold <= BigInt(0)) {
    return 0;
  }
  const hundredths = (current * BigInt(10_000)) / threshold;
  const bounded = hundredths < BigInt(0)
    ? BigInt(0)
    : hundredths > BigInt(10_000)
      ? BigInt(10_000)
      : hundredths;
  return Number(bounded) / 100;
};
