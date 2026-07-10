import { ConvexError } from "convex/values";

export const retirePolicyV1 = (replacement: string): never => {
  throw new ConvexError({
    code: "API_VERSION_RETIRED",
    message: `Policy-v1 marketplace functions are deprecated and non-executing. Use ${replacement}.`,
  });
};
