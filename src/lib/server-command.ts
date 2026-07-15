import "server-only";

import {
  canonicalizePaymentServerCommand,
  type PaymentOperation,
  type PaymentServerCommand,
  type SignedPaymentServerCommand,
} from "../../shared/server-command";
import { getServerCommandSecret } from "./mpp";

const COMMAND_TTL_MS = 30_000;

const bytesToHex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

type VerifiedPaymentFacts = {
  operation: PaymentOperation;
  resourceId: string;
  amountBaseUnits: bigint;
  currencyAddress: string;
  challengeId: string;
  receiptReference: string;
  principalUserId?: string;
};

export const createSignedPaymentServerCommand = async (
  facts: VerifiedPaymentFacts,
): Promise<SignedPaymentServerCommand> => {
  const issuedAt = Date.now();
  const command: PaymentServerCommand = {
    operation: facts.operation,
    resourceId: facts.resourceId,
    amountBaseUnits: facts.amountBaseUnits.toString(),
    currencyAddress: facts.currencyAddress.trim().toLowerCase(),
    challengeId: facts.challengeId,
    receiptReference: facts.receiptReference,
    ...(facts.principalUserId
      ? { principalUserId: facts.principalUserId.trim() }
      : {}),
    issuedAt,
    expiresAt: issuedAt + COMMAND_TTL_MS,
    nonce: crypto.randomUUID(),
  };
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getServerCommandSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(canonicalizePaymentServerCommand(command)),
  );

  return { command, signature: bytesToHex(signature) };
};
