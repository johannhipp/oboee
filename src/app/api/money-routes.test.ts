import { afterEach, describe, expect, it, vi } from "vitest";

const fetchQuery = vi.fn();
const getMppx = vi.fn();

vi.mock("convex/nextjs", () => ({
  fetchMutation: vi.fn(),
  fetchQuery,
}));

vi.mock("@/lib/mpp", () => ({
  getMppx,
}));

describe("money route kill switch", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not issue a funding challenge while disabled", async () => {
    vi.stubEnv("OBOE_MONEY_WRITES_ENABLED", "false");
    const { POST } = await import("./rfs/[id]/fund/route");

    const response = await POST(new Request("http://localhost/api/rfs/rfs-id/fund"), {
      params: Promise.resolve({ id: "rfs-id" }),
    });

    expect(response.status).toBe(503);
    expect(getMppx).not.toHaveBeenCalled();
    expect(fetchQuery).not.toHaveBeenCalled();
  });

  it("allows an entitled content read without opening the money gate", async () => {
    vi.stubEnv("OBOE_MONEY_WRITES_ENABLED", "false");
    fetchQuery.mockResolvedValueOnce({
      hasAccess: true,
      skill: {
        _id: "skill-id",
        status: "published",
        contentMarkdown: "safe fixture",
      },
      skillVersion: {
        version: 1,
        contentHash: "sha256:fixture",
        evaluationDeadline: 1,
      },
    });
    const { GET } = await import("./skills/[id]/content/route");

    const response = await GET(new Request("http://localhost/api/skills/skill-id/content"), {
      params: Promise.resolve({ id: "skill-id" }),
    });

    expect(response.status).toBe(200);
    expect(getMppx).not.toHaveBeenCalled();
  });

  it("does not issue a purchase challenge while disabled", async () => {
    vi.stubEnv("OBOE_MONEY_WRITES_ENABLED", "false");
    fetchQuery.mockResolvedValueOnce({
      hasAccess: false,
      skill: {
        _id: "skill-id",
        status: "published",
        purchasePriceBaseUnits: BigInt(5_000),
      },
      skillVersion: {
        version: 1,
        contentHash: "sha256:fixture",
        evaluationDeadline: 1,
      },
    });
    const { GET } = await import("./skills/[id]/content/route");

    const response = await GET(new Request("http://localhost/api/skills/skill-id/content"), {
      params: Promise.resolve({ id: "skill-id" }),
    });

    expect(response.status).toBe(503);
    expect(getMppx).not.toHaveBeenCalled();
  });
});
