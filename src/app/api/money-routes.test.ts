import { describe, expect, it, vi } from "vitest";

const fetchQueryMock = vi.fn();
const fetchMutationMock = vi.fn();
const getMppxMock = vi.fn();

vi.mock("convex/nextjs", () => ({
  fetchQuery: fetchQueryMock,
  fetchMutation: fetchMutationMock,
}));
vi.mock("@/lib/mpp", () => ({ getMppx: getMppxMock }));

describe("retired money routes", () => {
  it("returns the funding successor without invoking business or payment dependencies", async () => {
    const { POST } = await import("./rfs/[id]/fund/route");
    const response = await POST(new Request("https://oboe.test/api/rfs/rfs-1/fund", { method: "POST" }), { params: Promise.resolve({ id: "rfs-1" }) });
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      code: "api_version_retired",
      replacement: { method: "POST", path: "/api/v2/rfs/rfs-1/funding-intents" },
    });
    expect(fetchQueryMock).not.toHaveBeenCalled();
    expect(fetchMutationMock).not.toHaveBeenCalled();
    expect(getMppxMock).not.toHaveBeenCalled();
  });

  it("returns the content capability successor without reading protected content", async () => {
    const { GET } = await import("./skills/[id]/content/route");
    const response = await GET(new Request("https://oboe.test/api/skills/skill-1/content"), { params: Promise.resolve({ id: "skill-1" }) });
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      code: "api_version_retired",
      replacement: { method: "GET", path: "/api/v2/skills/skill-1" },
    });
    expect(fetchQueryMock).not.toHaveBeenCalled();
    expect(fetchMutationMock).not.toHaveBeenCalled();
    expect(getMppxMock).not.toHaveBeenCalled();
  });
});
