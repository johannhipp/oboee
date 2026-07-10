export const moneyWritesEnabled = () => process.env.OBOE_MONEY_WRITES_ENABLED === "true";

export const moneyWritesDisabledResponse = () =>
  moneyWritesEnabled()
    ? null
    : Response.json(
        {
          status: "error",
          code: "MONEY_WRITES_DISABLED",
          message: "Money-bearing operations are temporarily disabled.",
        },
        {
          status: 503,
          headers: {
            "Retry-After": "300",
          },
        },
      );
