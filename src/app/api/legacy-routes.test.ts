import { describe, expect, it } from "vitest";

const request = (path: string, method = "POST") => new Request(`https://oboe.test${path}`, { method });
const context = { params: Promise.resolve({ id: "resource-1" }) };

describe("retired unversioned business API", () => {
  it.each([
    ["catalog", async () => (await import("./skills/route")).GET()],
    ["skill detail", async () => (await import("./skills/[id]/route")).GET(request("/api/skills/resource-1", "GET"), context)],
    ["skill content", async () => (await import("./skills/[id]/content/route")).GET(request("/api/skills/resource-1/content", "GET"), context)],
    ["create RFS", async () => (await import("./rfs/route")).POST()],
    ["RFS detail", async () => (await import("./rfs/[id]/route")).GET(request("/api/rfs/resource-1", "GET"), context)],
    ["claim", async () => (await import("./rfs/[id]/claim/route")).POST(request("/api/rfs/resource-1/claim"), context)],
    ["submit", async () => (await import("./rfs/[id]/submit/route")).POST(request("/api/rfs/resource-1/submit"), context)],
    ["evaluation read", async () => (await import("./rfs/[id]/evaluation/route")).GET(request("/api/rfs/resource-1/evaluation", "GET"), context)],
    ["evaluation write", async () => (await import("./rfs/[id]/evaluations/route")).POST(request("/api/rfs/resource-1/evaluations"), context)],
    ["evaluation close", async () => (await import("./rfs/[id]/evaluation/close/route")).POST(request("/api/rfs/resource-1/evaluation/close"), context)],
    ["dispute", async () => (await import("./rfs/[id]/dispute/route")).POST(request("/api/rfs/resource-1/dispute"), context)],
    ["fund", async () => (await import("./rfs/[id]/fund/route")).POST(request("/api/rfs/resource-1/fund"), context)],
    ["payout claim", async () => (await import("./rfs/[id]/payout/claim/route")).POST()],
    ["wallet", async () => (await import("./me/wallet/route")).POST()],
  ])("returns 410 for %s", async (_name, invoke) => {
    const response = await invoke();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ code: "api_version_retired", apiVersion: "v2" });
  });
});
