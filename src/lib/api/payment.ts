import { Credential } from "mppx";
import { keccak256 } from "viem";

export class PaymentCredentialError extends Error {
  readonly code = "INVALID_CHALLENGE";

  constructor(message: string) {
    super(message);
    this.name = "PaymentCredentialError";
  }
}

const requiredString = (value: unknown, message: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new PaymentCredentialError(message);
  }
  return value;
};

export const readVerifiedPayment = (request: Request) => {
  const credential = Credential.fromRequest(request);
  const challengeRequest: unknown = credential.challenge.request;
  if (!challengeRequest || typeof challengeRequest !== "object") {
    throw new PaymentCredentialError("Paid credential challenge was malformed.");
  }
  const fields = challengeRequest as Record<string, unknown>;
  const amount = requiredString(
    fields.amount,
    "Paid credential did not include an amount.",
  );
  if (!/^\d+$/.test(amount)) {
    throw new PaymentCredentialError("Paid credential amount was not in base units.");
  }
  const currencyAddress = requiredString(
    fields.currency,
    "Paid credential did not include a currency.",
  );
  const principalUserId =
    typeof fields.externalId === "string" && fields.externalId.trim()
      ? fields.externalId.trim()
      : undefined;

  const payload: unknown = credential.payload;
  if (!payload || typeof payload !== "object") {
    throw new PaymentCredentialError("Paid credential payload was malformed.");
  }
  const payloadFields = payload as Record<string, unknown>;
  let receiptReference: string;
  if (payloadFields.type === "hash") {
    receiptReference = requiredString(
      payloadFields.hash,
      "Paid credential did not include a transaction hash.",
    );
  } else if (payloadFields.type === "transaction") {
    const signature = requiredString(
      payloadFields.signature,
      "Paid credential did not include a signed transaction.",
    );
    if (!/^0x[0-9a-fA-F]+$/.test(signature) || signature.length % 2 !== 0) {
      throw new PaymentCredentialError("Paid credential transaction was malformed.");
    }
    receiptReference = keccak256(signature as `0x${string}`);
  } else {
    throw new PaymentCredentialError("Paid credential payload type was unsupported.");
  }

  return {
    amountBaseUnits: BigInt(amount),
    challengeId: credential.challenge.id,
    currencyAddress,
    principalUserId,
    receiptReference,
  };
};
