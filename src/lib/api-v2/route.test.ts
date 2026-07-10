import { describe, expect, it } from "vitest";

import { requireCommandOrigin } from "./route";

describe("v2 command origin", () => {
  it("requires an exact origin for cookie commands", () => {
    const request = new Request("https://oboe.test/api/v2/rfs/id/funding-intents", { method: "POST" });
    expect(() => requireCommandOrigin(request, { method: "cookie" })).toThrow("matching Origin");
    expect(() => requireCommandOrigin(new Request(request, { headers: { origin: "https://evil.test" } }), { method: "cookie" })).toThrow("matching Origin");
    expect(() => requireCommandOrigin(new Request(request, { headers: { origin: "https://oboe.test" } }), { method: "cookie" })).not.toThrow();
  });

  it("does not apply ambient browser-origin authority to API keys", () => {
    const request = new Request("https://oboe.test/api/v2/rfs/id/funding-intents", { method: "POST" });
    expect(() => requireCommandOrigin(request, { method: "api_key" })).not.toThrow();
  });
});
