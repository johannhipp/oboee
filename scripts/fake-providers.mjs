import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

import { encodeAbiParameters, encodeEventTopics } from "viem";
import { Abis } from "viem/tempo";

const port = Number(process.env.OBOE_FAKE_PROVIDER_PORT ?? "4100");
const authToken = process.env.OBOE_FAKE_PROVIDER_TOKEN ?? "local-e2e-provider-token";
const wrappedKeys = new Map();
const mppReceipts = new Map();
const custodyTransfers = new Map();
let loseNextCustodyResponse = false;

const send = (response, status, body) => {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  response.end(payload);
};

const readJson = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const authorized = (request) => request.headers.authorization === `Bearer ${authToken}`;
const hash = (value) => `0x${createHash("sha256").update(value).digest("hex")}`;

const transferReceipt = ({ transactionHash, currency, sender, recipient, amount }) => {
  const blockHash = hash(`block:${transactionHash}`);
  const topics = encodeEventTopics({
    abi: Abis.tip20,
    eventName: "Transfer",
    args: { from: sender, to: recipient },
  });
  const data = encodeAbiParameters([{ type: "uint256" }], [BigInt(amount)]);
  return {
    blockHash,
    blockNumber: "0x1",
    contractAddress: null,
    cumulativeGasUsed: "0x5208",
    effectiveGasPrice: "0x1",
    from: sender,
    gasUsed: "0x5208",
    logs: [{
      address: currency,
      blockHash,
      blockNumber: "0x1",
      data,
      logIndex: "0x0",
      removed: false,
      topics,
      transactionHash,
      transactionIndex: "0x0",
    }],
    logsBloom: `0x${"0".repeat(512)}`,
    status: "0x1",
    to: currency,
    transactionHash,
    transactionIndex: "0x0",
    type: "0x0",
  };
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return send(response, 200, { ready: true });
    }
    if (request.method === "POST" && url.pathname === "/rpc") {
      const body = await readJson(request);
      let result = null;
      if (body.method === "eth_chainId") result = "0x1079";
      if (body.method === "eth_getTransactionReceipt") {
        const transactionHash = Array.isArray(body.params) ? body.params[0] : undefined;
        result = typeof transactionHash === "string" ? mppReceipts.get(transactionHash.toLowerCase()) ?? null : null;
      }
      return send(response, 200, { jsonrpc: "2.0", id: body.id ?? null, result });
    }
    if (!authorized(request)) return send(response, 401, { code: "unauthorized" });

    if (request.method === "POST" && url.pathname === "/v1/wrap") {
      const body = await readJson(request);
      const key = typeof body.plaintextKey === "string" ? Buffer.from(body.plaintextKey, "base64") : Buffer.alloc(0);
      if (key.length !== 32) return send(response, 400, { code: "invalid_key" });
      const wrappedDataKey = `fake:${randomBytes(18).toString("base64url")}`;
      wrappedKeys.set(wrappedDataKey, Buffer.from(key));
      return send(response, 200, { wrappedDataKey, keyVersion: "fake-kms-v1" });
    }
    if (request.method === "POST" && url.pathname === "/v1/unwrap") {
      const body = await readJson(request);
      const key = wrappedKeys.get(body.wrappedDataKey);
      if (!key || body.keyVersion !== "fake-kms-v1") return send(response, 404, { code: "key_not_found" });
      return send(response, 200, { plaintextKey: key.toString("base64") });
    }
    if (request.method === "POST" && url.pathname === "/v1/scan") {
      const body = await readJson(request);
      const storage = typeof body.storageUrl === "string" ? await fetch(body.storageUrl) : null;
      const ciphertext = storage?.ok ? Buffer.from(await storage.arrayBuffer()) : Buffer.alloc(0);
      const digest = createHash("sha256").update(ciphertext).digest("hex");
      const contentTypeMatches = ciphertext.length > 0 && digest === body.ciphertextSha256;
      return send(response, 200, {
        malwareDetected: false,
        contentTypeMatches,
        reportReference: `fake-scan:${String(body.artifactId ?? "unknown")}`,
      });
    }
    if (request.method === "POST" && url.pathname === "/mpp/register") {
      const body = await readJson(request);
      if (![body.transactionHash, body.currency, body.sender, body.recipient, body.amount].every((value) => typeof value === "string")) {
        return send(response, 400, { code: "invalid_receipt_registration" });
      }
      mppReceipts.set(body.transactionHash.toLowerCase(), transferReceipt(body));
      return send(response, 201, { registered: true });
    }
    if (request.method === "POST" && url.pathname === "/control/custody-lost-response-once") {
      loseNextCustodyResponse = true;
      return send(response, 200, { armed: true });
    }
    if (request.method === "POST" && url.pathname === "/v1/transfers") {
      const body = await readJson(request);
      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string") return send(response, 400, { code: "idempotency_key_required" });
      let receipt = custodyTransfers.get(idempotencyKey);
      if (!receipt) {
        const transactionHash = hash(`custody:${idempotencyKey}`);
        receipt = {
          network: body.network,
          tokenAddress: body.tokenAddress,
          senderAddress: body.senderAddress,
          recipientAddress: body.recipientAddress,
          amountBaseUnits: body.amountBaseUnits,
          transactionHash,
          confirmations: 2,
          success: true,
          custodyNonce: `nonce:${idempotencyKey}`,
        };
        custodyTransfers.set(idempotencyKey, receipt);
      }
      if (loseNextCustodyResponse) {
        loseNextCustodyResponse = false;
        return send(response, 503, { code: "simulated_lost_response" });
      }
      return send(response, 200, {
        custodyNonce: receipt.custodyNonce,
        transactionHash: receipt.transactionHash,
      });
    }
    if (request.method === "GET" && url.pathname.startsWith("/v1/transfers/")) {
      const idempotencyKey = decodeURIComponent(url.pathname.slice("/v1/transfers/".length));
      const receipt = custodyTransfers.get(idempotencyKey);
      return receipt ? send(response, 200, receipt) : send(response, 404, { code: "transfer_not_found" });
    }
    return send(response, 404, { code: "not_found" });
  } catch (error) {
    return send(response, 500, { code: "fake_provider_error", message: error instanceof Error ? error.message : "unknown" });
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Fake providers ready at http://127.0.0.1:${port}\n`);
});

const close = () => server.close(() => process.exit(0));
process.on("SIGINT", close);
process.on("SIGTERM", close);
