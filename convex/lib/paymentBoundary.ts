import { ConvexError } from "convex/values";

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

export type PaymentPrincipal =
  | { kind: "user"; userId: string }
  | { kind: "anonymous"; paymentReference: string };

export const resolveVerifiedPaymentPrincipal = (
  authenticatedUserId: string | undefined,
  principalUserId: string | undefined,
  challengeId: string,
): PaymentPrincipal => {
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
  const userId = authenticatedUserId ?? normalizedPrincipal;
  return userId
    ? { kind: "user", userId }
    : { kind: "anonymous", paymentReference: challengeId };
};
