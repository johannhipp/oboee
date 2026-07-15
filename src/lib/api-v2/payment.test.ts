import { describe, expect, it } from "vitest";

import { bondIntentRoute, fundingIntentRoute, purchaseIntentRoute } from "./payment";

const unauthenticatedRequest = (body: unknown) => new Request("https://oboe.test/api/v2/payment", {
  method: "POST",
  headers: { "content-type": "application/json", "idempotency-key": "payment-test" },
  body: JSON.stringify(body),
});

describe("payment intent authentication boundary", () => {
  it.each([
    ["purchase", () => purchaseIntentRoute(unauthenticatedRequest({ skillVersionId: "version_1" }), "skill_1")],
    ["funding", () => fundingIntentRoute(unauthenticatedRequest({ amountBaseUnits: "100" }), "rfs_1")],
    ["bond", () => bondIntentRoute(unauthenticatedRequest({ applicationId: "application_1" }), "rfs_1")],
  ])("returns 401 before creating a %s intent", async (_name, invoke) => {
    const response = await invoke();
    const payload = await response.json() as { code: string };

    expect(response.status).toBe(401);
    expect(payload.code).toBe("authentication_required");
  });
});
