export const TEMPO_MODERATO_CHAIN_ID = 42_431;
export const TEMPO_MODERATO_PATH_USD =
  "0x20c0000000000000000000000000000000000000" as const;
export const TEMPO_MODERATO_RPC_URL = "https://rpc.moderato.tempo.xyz";
export const MVP_MAX_PAYMENT_BASE_UNITS = BigInt(9_000);

export const isMvpPaymentBaseUnits = (value: bigint) =>
  value >= BigInt(1) && value <= MVP_MAX_PAYMENT_BASE_UNITS;
