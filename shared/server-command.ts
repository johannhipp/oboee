export const SERVER_COMMAND_VERSION = "oboe-payment-v1" as const;

export type PaymentOperation = "fund" | "purchase";

export type PaymentServerCommand = {
  operation: PaymentOperation;
  resourceId: string;
  amountBaseUnits: string;
  currencyAddress: string;
  challengeId: string;
  receiptReference: string;
  principalUserId?: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export type SignedPaymentServerCommand = {
  command: PaymentServerCommand;
  signature: string;
};

export const canonicalizePaymentServerCommand = (
  command: PaymentServerCommand,
) =>
  JSON.stringify([
    SERVER_COMMAND_VERSION,
    command.operation,
    command.resourceId,
    command.amountBaseUnits,
    command.currencyAddress,
    command.challengeId,
    command.receiptReference,
    command.principalUserId ?? "",
    command.issuedAt,
    command.expiresAt,
    command.nonce,
  ]);
