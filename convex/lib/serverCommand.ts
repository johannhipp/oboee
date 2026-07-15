import { ConvexError } from "convex/values";

import {
  canonicalizePaymentServerCommand,
  type PaymentServerCommand,
} from "../../shared/server-command";
import { getServerCommandSecret } from "./env";

const COMMAND_TTL_MS = 60_000;
const CLOCK_SKEW_MS = 5_000;
const HEX_SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

const commandError = (message: string): never => {
  throw new ConvexError({ code: "INVALID_COMMAND", message });
};

const hexToBytes = (value: string) => {
  if (!HEX_SIGNATURE_PATTERN.test(value)) {
    return commandError("Payment command signature is malformed.");
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const validateCommandFields = (command: PaymentServerCommand, now: number) => {
  if (!command.resourceId.trim()) {
    commandError("Payment command resource is missing.");
  }
  if (!POSITIVE_INTEGER_PATTERN.test(command.amountBaseUnits)) {
    commandError("Payment command amount must be positive base units.");
  }
  if (!command.currencyAddress.trim()) {
    commandError("Payment command currency is missing.");
  }
  if (!command.challengeId.trim() || !command.receiptReference.trim()) {
    commandError("Payment command receipt facts are incomplete.");
  }
  if (command.principalUserId !== undefined && !command.principalUserId.trim()) {
    commandError("Payment command principal is invalid.");
  }
  if (command.nonce.length < 16 || command.nonce.length > 128) {
    commandError("Payment command nonce is invalid.");
  }
  if (
    !Number.isSafeInteger(command.issuedAt) ||
    !Number.isSafeInteger(command.expiresAt) ||
    command.issuedAt > now + CLOCK_SKEW_MS ||
    command.expiresAt <= now ||
    command.expiresAt <= command.issuedAt ||
    command.expiresAt - command.issuedAt > COMMAND_TTL_MS
  ) {
    commandError("Payment command is expired or has an invalid lifetime.");
  }
};

export const verifyPaymentServerCommand = async (
  command: PaymentServerCommand,
  signature: string,
  now = Date.now(),
) => {
  validateCommandFields(command, now);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getServerCommandSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    hexToBytes(signature),
    new TextEncoder().encode(canonicalizePaymentServerCommand(command)),
  );
  if (!verified) {
    commandError("Payment command signature is invalid.");
  }
};
