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
  const challengeRequest = credential.challenge.request as {
    amount?: unknown;
    currency?: unknown;
    externalId?: unknown;
  };
  const amount = requiredString(
    challengeRequest.amount,
    "Paid credential did not include an amount.",
  );
  if (!/^\d+$/.test(amount)) {
    throw new PaymentCredentialError("Paid credential amount was not in base units.");
  }
  const currencyAddress = requiredString(
    challengeRequest.currency,
    "Paid credential did not include a currency.",
  );
  const principalUserId =
    typeof challengeRequest.externalId === "string" &&
    challengeRequest.externalId.trim().length > 0
      ? challengeRequest.externalId.trim()
      : undefined;
  const payload = credential.payload as {
    type?: unknown;
    hash?: unknown;
    signature?: unknown;
  };
  let receiptReference: string;
  if (payload.type === "hash") {
    receiptReference = requiredString(
      payload.hash,
      "Paid credential did not include a transaction hash.",
    );
  } else if (payload.type === "transaction") {
    const signature = requiredString(
      payload.signature,
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
