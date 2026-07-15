import { ConvexError } from "convex/values";

const configurationError = (message: string): never => {
  throw new ConvexError({ code: "CONFIGURATION_ERROR", message });
};

export const getConvexSiteUrl = () => {
  const value = process.env.SITE_URL?.trim();
  if (!value) {
    return null;
  }
  try {
    return new URL(value).toString();
  } catch {
    return configurationError("SITE_URL must be a valid URL.");
  }
};

export const getServerCommandSecret = () => {
  const value = process.env.OBOE_SERVER_COMMAND_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new ConvexError({
      code: "PAYMENT_UNAVAILABLE",
      message: "Signed payment ingress is not configured.",
    });
  }
  return value;
};
