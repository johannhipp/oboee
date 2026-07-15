import { Challenge } from "mppx";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };
const PATH_USD = "0x20c0000000000000000000000000000000000000";

const configureTestnet = () => {
  process.env.MPP_NETWORK = "tempo-moderato";
  process.env.MPP_RECIPIENT_ESCROW_ADDRESS =
    "0x1111111111111111111111111111111111111111";
  process.env.MPP_FUNDING_TOKEN_ADDRESS = PATH_USD;
  process.env.MPP_SECRET_KEY = "0123456789abcdef0123456789abcdef";
  process.env.OBOE_PAYMENT_RECORDING_SECRET =
    "abcdef0123456789abcdef0123456789";
};

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("MPP testnet configuration", () => {
  it("fails closed when the network is not explicitly Tempo Moderato", async () => {
    configureTestnet();
    delete process.env.MPP_NETWORK;

    const { getMppx } = await import("./mpp");

    expect(() => getMppx()).toThrow('MPP_NETWORK must be "tempo-moderato"');
  });

  it("rejects absent, zero, or malformed payment configuration", async () => {
    configureTestnet();
    delete process.env.MPP_RECIPIENT_ESCROW_ADDRESS;
    let payment = await import("./mpp");
    expect(() => payment.getMppx()).toThrow("MPP_RECIPIENT_ESCROW_ADDRESS");

    vi.resetModules();
    configureTestnet();
    process.env.MPP_RECIPIENT_ESCROW_ADDRESS =
      "0x0000000000000000000000000000000000000000";
    payment = await import("./mpp");
    expect(() => payment.getMppx()).toThrow("nonzero");

    vi.resetModules();
    configureTestnet();
    delete process.env.MPP_SECRET_KEY;
    payment = await import("./mpp");
    expect(() => payment.getMppx()).toThrow("MPP_SECRET_KEY");
  });

  it("only accepts pathUSD for the MVP testnet", async () => {
    configureTestnet();
    process.env.MPP_FUNDING_TOKEN_ADDRESS =
      "0x2222222222222222222222222222222222222222";

    const { getMppx } = await import("./mpp");

    expect(() => getMppx()).toThrow("Moderato pathUSD");
  });

  it("creates a charge handler for explicit Moderato configuration", async () => {
    configureTestnet();

    const { getMppx } = await import("./mpp");

    expect(getMppx().charge).toBeTypeOf("function");
  });

  it("fails closed when fee sponsorship is enabled without a valid key", async () => {
    configureTestnet();
    process.env.MPP_ENABLE_FEE_PAYER = "true";
    process.env.MPP_FEE_PAYER_PRIVATE_KEY = "not-a-private-key";

    const { getMppx } = await import("./mpp");

    expect(() => getMppx()).toThrow("MPP_FEE_PAYER_PRIVATE_KEY");
  });

  it("fails closed when server-to-Convex payment recording is not configured", async () => {
    configureTestnet();
    delete process.env.OBOE_PAYMENT_RECORDING_SECRET;

    const { getMppx } = await import("./mpp");

    expect(() => getMppx()).toThrow("OBOE_PAYMENT_RECORDING_SECRET");
  });

  it("issues a Moderato challenge bound to the browser principal", async () => {
    configureTestnet();
    const { getMppx, TEMPO_MODERATO_CHAIN_ID } = await import("./mpp");
    const handler = getMppx().charge({
      amount: "0.001",
      externalId: "browser-user-id",
    })(() => Response.json({ status: "ok" }));

    const response = await handler(new Request("http://localhost/api/paid"));
    const challenge = Challenge.fromResponse(response);

    expect(response.status).toBe(402);
    expect(challenge.request).toMatchObject({
      amount: "1000",
      currency: PATH_USD,
      externalId: "browser-user-id",
      methodDetails: { chainId: TEMPO_MODERATO_CHAIN_ID },
    });
  });
});
