import { ConvexError } from "convex/values";

const constantTimeEqual = (left: string, right: string) => {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
};

export const assertServerSecret = (
  providedSecret: string,
  environmentName: "OBOE_PAYMENT_RECORDING_SECRET" | "OBOE_SEED_SECRET",
  unavailableMessage: string,
) => {
  const expectedSecret = process.env[environmentName]?.trim();
  if (!expectedSecret || expectedSecret.length < 32) {
    throw new ConvexError({
      code: "PAYMENT_UNAVAILABLE",
      message: unavailableMessage,
    });
  }
  if (!constantTimeEqual(providedSecret, expectedSecret)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "This operation is restricted to an authorized server.",
    });
  }
};
