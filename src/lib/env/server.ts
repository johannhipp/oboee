import "server-only";

import { normalizeEvmAddress } from "../../../shared/domain/strings";
import {
  TEMPO_MODERATO_PATH_USD,
  TEMPO_MODERATO_RPC_URL,
} from "../../../shared/domain/tempo";

const PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;

export class PaymentConfigurationError extends Error {
  readonly code = "PAYMENT_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigurationError";
  }
}

const configurationError = (message: string): never => {
  throw new PaymentConfigurationError(message);
};

const requiredUrl = (name: string, rawValue: string | undefined) => {
  const value = rawValue?.trim();
  if (!value) {
    return configurationError(`${name} is required.`);
  }
  try {
    return new URL(value).toString();
  } catch {
    return configurationError(`${name} must be a valid URL.`);
  }
};

const requiredOrigin = (name: string, rawValue: string | undefined) => {
  const value = requiredUrl(name, rawValue);
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash) {
    return configurationError(`${name} must be an origin without a path.`);
  }
  return url.origin;
};

const requiredAddress = (name: string, rawValue: string | undefined) => {
  const value = normalizeEvmAddress(rawValue ?? "");
  return value ?? configurationError(`${name} must be a valid nonzero EVM address.`);
};

const requiredSecret = (name: string, rawValue: string | undefined) => {
  const value = rawValue?.trim();
  if (!value || value.length < 32) {
    return configurationError(`${name} must contain at least 32 characters.`);
  }
  return value;
};

export const readAuthServerConfiguration = () => ({
  convexUrl: requiredOrigin(
    "NEXT_PUBLIC_CONVEX_URL",
    process.env.NEXT_PUBLIC_CONVEX_URL,
  ),
  convexSiteUrl: requiredOrigin(
    "NEXT_PUBLIC_CONVEX_SITE_URL",
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
  ),
});

export const readMppServerConfiguration = () => {
  if (process.env.MPP_NETWORK?.trim() !== "tempo-moderato") {
    configurationError('MPP_NETWORK must be "tempo-moderato" for the MVP.');
  }

  const recipient = requiredAddress(
    "MPP_RECIPIENT_ESCROW_ADDRESS",
    process.env.MPP_RECIPIENT_ESCROW_ADDRESS,
  );
  const currency = requiredAddress(
    "MPP_FUNDING_TOKEN_ADDRESS",
    process.env.MPP_FUNDING_TOKEN_ADDRESS,
  );
  if (currency !== TEMPO_MODERATO_PATH_USD) {
    configurationError(
      `MPP_FUNDING_TOKEN_ADDRESS must be Moderato pathUSD (${TEMPO_MODERATO_PATH_USD}).`,
    );
  }

  const rpcUrl = process.env.OBOE_MPP_RPC_URL?.trim() || TEMPO_MODERATO_RPC_URL;
  let parsedRpcUrl: URL;
  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    return configurationError("OBOE_MPP_RPC_URL must be a valid URL.");
  }
  if (
    parsedRpcUrl.protocol !== "https:" &&
    parsedRpcUrl.hostname !== "127.0.0.1" &&
    parsedRpcUrl.hostname !== "localhost"
  ) {
    configurationError("OBOE_MPP_RPC_URL must use HTTPS (or localhost for tests).");
  }

  const feePayerEnabled = process.env.MPP_ENABLE_FEE_PAYER === "true";
  const feePayerPrivateKey = process.env.MPP_FEE_PAYER_PRIVATE_KEY?.trim();
  if (
    feePayerEnabled &&
    (!feePayerPrivateKey || !PRIVATE_KEY_PATTERN.test(feePayerPrivateKey))
  ) {
    configurationError(
      "MPP_FEE_PAYER_PRIVATE_KEY must be a 32-byte hex private key when fee sponsorship is enabled.",
    );
  }

  return {
    currency,
    feePayerPrivateKey:
      feePayerEnabled && feePayerPrivateKey
        ? (feePayerPrivateKey as `0x${string}`)
        : undefined,
    recipient,
    rpcUrl: parsedRpcUrl.toString(),
    secretKey: requiredSecret("MPP_SECRET_KEY", process.env.MPP_SECRET_KEY),
    serverCommandSecret: requiredSecret(
      "OBOE_SERVER_COMMAND_SECRET",
      process.env.OBOE_SERVER_COMMAND_SECRET,
    ),
  };
};
