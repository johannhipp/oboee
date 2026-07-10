import { describe, expect, it, vi } from "vitest";

import { ApiAuthenticationError, resolveApiAuthentication } from "./api-auth";

describe("API authentication", () => {
  it("resolves browser and API-key credentials to the returned Convex token", async () => {
    const resolve = vi.fn().mockResolvedValue("principal-token");
    await expect(
      resolveApiAuthentication(
        new Request("https://oboe.test/api/v2/rfs", { headers: { cookie: "session=value" } }),
        resolve,
      ),
    ).resolves.toEqual({ token: "principal-token", method: "cookie" });
    await expect(
      resolveApiAuthentication(
        new Request("https://oboe.test/api/v2/rfs", { headers: { "x-api-key": "oboe_key" } }),
        resolve,
      ),
    ).resolves.toEqual({ token: "principal-token", method: "api_key" });
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("fails closed before token exchange when no supported credentials exist", async () => {
    const resolve = vi.fn().mockResolvedValue("unexpected");
    await expect(
      resolveApiAuthentication(new Request("https://oboe.test/api/v2/rfs"), resolve),
    ).rejects.toBeInstanceOf(ApiAuthenticationError);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects invalid or revoked credentials", async () => {
    await expect(
      resolveApiAuthentication(
        new Request("https://oboe.test/api/v2/rfs", { headers: { "x-api-key": "revoked" } }),
        async () => undefined,
      ),
    ).rejects.toMatchObject({ code: "authentication_required", status: 401 });
  });
});
