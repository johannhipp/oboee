import { ConvexError } from "convex/values";
import { assertServerSecret } from "./secretBoundary";

type PaymentEventFacts = {
  type: "fund" | "buy";
  resourceId: string;
  challengeId: string;
  receiptReference: string;
  amountBaseUnits: bigint;
  currencyAddress: string;
  status: string;
};

const idempotencyConflict = () =>
  new ConvexError({
    code: "IDEMPOTENCY_CONFLICT",
    message: "This payment challenge was already recorded with different facts.",
  });

export const assertPaymentEventCompatible = (
  existing: PaymentEventFacts | null,
  expected: PaymentEventFacts & { type: "fund" | "buy" },
) => {
  if (!existing) {
    return;
  }

  if (
    existing.type !== expected.type ||
    existing.resourceId !== expected.resourceId ||
    existing.challengeId !== expected.challengeId ||
    existing.receiptReference !== expected.receiptReference ||
    existing.amountBaseUnits !== expected.amountBaseUnits ||
    existing.currencyAddress !== expected.currencyAddress ||
    existing.status !== expected.status
  ) {
    throw idempotencyConflict();
  }
};

export const paymentIdempotencyConflict = (): never => {
  throw idempotencyConflict();
};

export const assertPaymentServerSecret = (providedSecret: string) =>
  assertServerSecret(
    providedSecret,
    "OBOE_PAYMENT_RECORDING_SECRET",
    "Payment recording is not configured.",
  );

export const resolvePaymentPrincipal = (
  authenticatedUserId: string | undefined,
  principalUserId: string | undefined,
  challengeId: string,
) => {
  const normalizedPrincipal = principalUserId?.trim();
  if (normalizedPrincipal && normalizedPrincipal.length > 256) {
    throw new ConvexError({
      code: "INVALID_PRINCIPAL",
      message: "Payment principal is invalid.",
    });
  }
  if (
    authenticatedUserId &&
    normalizedPrincipal &&
    authenticatedUserId !== normalizedPrincipal
  ) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Payment principal does not match the authenticated user.",
    });
  }
  return authenticatedUserId ?? normalizedPrincipal ?? `agent:${challengeId.slice(0, 18)}`;
};
