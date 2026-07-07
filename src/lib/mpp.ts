import { Mppx, tempo } from "mppx/nextjs";
import { privateKeyToAccount } from "viem/accounts";

// =============================================================================
// MIGRATION: Testnet -> Mainnet
// When switching to production with tempo wallet, change these values:
//
// 1. RECIPIENT_ADDRESS -> your mainnet wallet address (from `tempo wallet -t whoami`)
// 2. CURRENCY_ADDRESS  -> mainnet USDC: "0x..." (check https://docs.tempo.xyz/quickstart/tokenlist)
// 3. RPC_URL           -> "https://rpc.tempo.xyz" (or remove to use default)
//
// Everything else stays the same. No code changes needed.
// =============================================================================

const RECIPIENT_ADDRESS = process.env.MPP_RECIPIENT_ESCROW_ADDRESS;
const CURRENCY_ADDRESS = process.env.MPP_FUNDING_TOKEN_ADDRESS;
const FEE_PAYER_PRIVATE_KEY = process.env.MPP_FEE_PAYER_PRIVATE_KEY;
const ENABLE_FEE_PAYER = process.env.MPP_ENABLE_FEE_PAYER === "true";
const hexAddressPattern = /^0x[a-fA-F0-9]{40}$/;
const hexPrivateKeyPattern = /^0x[a-fA-F0-9]{64}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const asHexAddress = (value: string | undefined): `0x${string}` | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!hexAddressPattern.test(normalized)) {
    return null;
  }

  return normalized as `0x${string}`;
};

const recipientAddress = asHexAddress(RECIPIENT_ADDRESS) ?? ZERO_ADDRESS;
const currencyAddress = asHexAddress(CURRENCY_ADDRESS) ?? ZERO_ADDRESS;
interface ChargeOptions {
  amount: string;
}

type RouteHandler = (request: Request) => Response | Promise<Response>;

interface PaymentClient {
  charge: (options: ChargeOptions) => (handler: RouteHandler) => RouteHandler;
}

const createMppx = () => {
  const feePayerAccount =
    ENABLE_FEE_PAYER &&
    typeof FEE_PAYER_PRIVATE_KEY === "string" &&
    hexPrivateKeyPattern.test(FEE_PAYER_PRIVATE_KEY)
      ? privateKeyToAccount(FEE_PAYER_PRIVATE_KEY as `0x${string}`)
      : undefined;

  return Mppx.create({
    methods: [
      tempo({
        currency: currencyAddress,
        recipient: recipientAddress,
        ...(feePayerAccount ? { feePayer: feePayerAccount } : {}),
        // MIGRATION: uncomment for mainnet fee sponsorship
        // feePayer: privateKeyToAccount('0x...'),
      }),
    ],
  });
};

let mppxInstance: PaymentClient | null = null;

export const getMppx = () => {
  mppxInstance ??= createMppx();
  return mppxInstance;
};
