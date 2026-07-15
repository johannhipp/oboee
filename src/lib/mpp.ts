import { Mppx, tempo } from "mppx/nextjs";
import { createClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import {
  PaymentConfigurationError,
  readMppServerConfiguration,
} from "./env/server";
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

export { PaymentConfigurationError };

const createMppx = () => {
  const configuration = readMppServerConfiguration();
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
        ...(configuration.feePayerPrivateKey
          ? { feePayer: privateKeyToAccount(configuration.feePayerPrivateKey) }
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

export const getServerCommandSecret = () =>
  readMppServerConfiguration().serverCommandSecret;

export const getMppFundingTokenAddress = () =>
  readMppServerConfiguration().currency;
