import { Mppx, tempo } from "mppx/nextjs";
import { createClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import {
  TEMPO_MODERATO_CHAIN_ID,
  TEMPO_MODERATO_PATH_USD,
  TEMPO_MODERATO_RPC_URL,
} from "./tempo";

export {
  TEMPO_MODERATO_CHAIN_ID,
  TEMPO_MODERATO_PATH_USD,
  TEMPO_MODERATO_RPC_URL,
};

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

const requiredAddress = (name: string, rawValue: string | undefined): `0x${string}` => {
  const value = rawValue?.trim();
  if (!value || !ADDRESS_PATTERN.test(value)) {
    return configurationError(`${name} must be a valid EVM address.`);
  }
  if (value.toLowerCase() === ZERO_ADDRESS) {
    return configurationError(`${name} must be a nonzero EVM address.`);
  }
  return value.toLowerCase() as `0x${string}`;
};

const requiredSecret = (name: string, rawValue: string | undefined): string => {
  const value = rawValue?.trim();
  if (value === undefined || value.length < 32) {
    throw new PaymentConfigurationError(`${name} must contain at least 32 characters.`);
  }
  return value;
};

const readConfiguration = () => {
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

  const secretKey = requiredSecret("MPP_SECRET_KEY", process.env.MPP_SECRET_KEY);
  const paymentRecordingSecret = requiredSecret(
    "OBOE_PAYMENT_RECORDING_SECRET",
    process.env.OBOE_PAYMENT_RECORDING_SECRET,
  );

  const rpcUrl = process.env.OBOE_MPP_RPC_URL?.trim() || TEMPO_MODERATO_RPC_URL;
  let parsedRpcUrl: URL;
  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    return configurationError("OBOE_MPP_RPC_URL must be a valid URL.");
  }
  if (parsedRpcUrl.protocol !== "https:" && parsedRpcUrl.hostname !== "127.0.0.1") {
    configurationError("OBOE_MPP_RPC_URL must use HTTPS (or localhost for tests). ");
  }

  const feePayerEnabled = process.env.MPP_ENABLE_FEE_PAYER === "true";
  const feePayerPrivateKey = process.env.MPP_FEE_PAYER_PRIVATE_KEY?.trim();
  if (feePayerEnabled && (!feePayerPrivateKey || !PRIVATE_KEY_PATTERN.test(feePayerPrivateKey))) {
    configurationError(
      "MPP_FEE_PAYER_PRIVATE_KEY must be a 32-byte hex private key when fee sponsorship is enabled.",
    );
  }

  return {
    currency,
    feePayerAccount:
      feePayerEnabled && feePayerPrivateKey
        ? privateKeyToAccount(feePayerPrivateKey as `0x${string}`)
        : undefined,
    recipient,
    paymentRecordingSecret,
    rpcUrl: parsedRpcUrl.toString(),
    secretKey,
  };
};

const createMppx = () => {
  const configuration = readConfiguration();
  const client = createClient({
    chain: tempoModerato,
    transport: http(configuration.rpcUrl),
  });

  return Mppx.create({
    secretKey: configuration.secretKey,
    methods: [
      tempo.charge({
        currency: configuration.currency,
        recipient: configuration.recipient,
        testnet: true,
        getClient: () => client,
        ...(configuration.feePayerAccount
          ? { feePayer: configuration.feePayerAccount }
          : {}),
      }),
    ],
  });
};

let mppxInstance: ReturnType<typeof createMppx> | null = null;

export const getMppx = () => {
  mppxInstance ??= createMppx();
  return mppxInstance;
};

export const getPaymentRecordingSecret = () => readConfiguration().paymentRecordingSecret;

export const getMppFundingTokenAddress = () => readConfiguration().currency;
