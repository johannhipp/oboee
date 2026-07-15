import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const ESCROW = "0xd9d633c71968410c6812d0849a665ab1f93c5841";
const PATH_USD = "0x20c0000000000000000000000000000000000000";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

const createMockNpx = async (body: string, exitCode = 0) => {
  const directory = await mkdtemp(join(tmpdir(), "oboe-pay-test-"));
  temporaryDirectories.push(directory);
  const executable = join(directory, "npx");
  await writeFile(
    executable,
    `#!/usr/bin/env bash\nprintf '%s\\n' '${body}'\nexit ${exitCode}\n`,
  );
  await chmod(executable, 0o755);
  return directory;
};

const challengeHeader = () => {
  const request = Buffer.from(
    JSON.stringify({
      amount: "1",
      currency: PATH_USD,
      recipient: ESCROW,
      methodDetails: { chainId: 42_431 },
    }),
  ).toString("base64url");
  return `Payment method="tempo", intent="charge", request="${request}"`;
};

const runAgainstServer = async ({
  mockNpxDirectory,
  paidBody = JSON.stringify({ status: "ok", resourceId: "contribution-1" }),
  paidReceipt = "receipt-data",
}: {
  mockNpxDirectory: string;
  paidBody?: string;
  paidReceipt?: string | null;
}) => {
  let requestCount = 0;
  const server = createServer((request, response) => {
    requestCount += 1;
    if (!request.headers.authorization) {
      response.writeHead(402, { "WWW-Authenticate": challengeHeader() });
      response.end();
      return;
    }

    response.writeHead(200, {
      "Content-Type": "application/json",
      ...(paidReceipt ? { "Payment-Receipt": paidReceipt } : {}),
    });
    response.end(paidBody);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock payment server did not bind a TCP port.");
  }

  try {
    const result = await execFileAsync(
      join(process.cwd(), "scripts/pay.sh"),
      ["GET", `http://127.0.0.1:${address.port}/paid`],
      {
        env: {
          ...process.env,
          MPPX_ACCOUNT: "test-account",
          OBOE_EXPECTED_ESCROW_ADDRESS: ESCROW,
          PATH: `${mockNpxDirectory}:${process.env.PATH ?? ""}`,
        },
      },
    );
    return { ...result, requestCount };
  } catch (error) {
    return { error: error as Error & { stderr?: string }, requestCount };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
};

describe("guarded Tempo payment helper", () => {
  it("reports success only with a receipt and application result", async () => {
    const mockNpxDirectory = await createMockNpx("Payment credential-data");
    const result = await runAgainstServer({ mockNpxDirectory });

    expect(result).not.toHaveProperty("error");
    expect(result.requestCount).toBe(2);
    expect("stdout" in result ? result.stdout : "").toContain('"status":"ok"');
    expect("stderr" in result ? result.stderr : "").toContain("Payment-Receipt");
  });

  it("sends no authorized retry when signing fails", async () => {
    const mockNpxDirectory = await createMockNpx("signer unavailable", 1);
    const result = await runAgainstServer({ mockNpxDirectory });

    expect(result).toHaveProperty("error");
    expect(result.requestCount).toBe(1);
    expect("error" in result ? result.error?.stderr : "").toContain(
      "no authorized retry was sent",
    );
  });

  it("rejects a paid 200 response without a payment receipt", async () => {
    const mockNpxDirectory = await createMockNpx("Payment credential-data");
    const result = await runAgainstServer({
      mockNpxDirectory,
      paidReceipt: null,
    });

    expect(result).toHaveProperty("error");
    expect(result.requestCount).toBe(2);
    expect("error" in result ? result.error?.stderr : "").toContain(
      "without a Payment-Receipt",
    );
  });
});
