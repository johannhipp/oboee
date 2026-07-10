import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

const root = new URL("../", import.meta.url).pathname;
const providerToken = "local-e2e-provider-token";
const childProcesses = [];

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${result.status ?? "without a status"}.`);
};

const start = (command, args, options = {}) => {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", ...options });
  childProcesses.push(child);
  return child;
};

const waitFor = async (url, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.`);
};

const isReady = async (url) => {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
};

const stopChildren = () => {
  for (const child of childProcesses.reverse()) {
    if (!child.killed) child.kill("SIGTERM");
  }
};

process.on("SIGINT", () => { stopChildren(); process.exit(130); });
process.on("SIGTERM", () => { stopChildren(); process.exit(143); });

try {
  if (!existsSync(`${root}.env.local`)) {
    run("npx", ["convex", "dev", "--once", "--typecheck", "disable"], {
      env: { ...process.env, CI: "1" },
    });
  }

  start("node", ["scripts/fake-providers.mjs"], {
    env: { ...process.env, OBOE_FAKE_PROVIDER_TOKEN: providerToken },
  });
  await waitFor("http://127.0.0.1:4100/health");

  const reusedConvex = await isReady("http://127.0.0.1:3210/version");
  if (!reusedConvex) {
    start("npx", ["convex", "dev", "--typecheck", "disable", "--tail-logs", "disable"], {
      env: { ...process.env, CI: "1" },
    });
    await waitFor("http://127.0.0.1:3210/version");
  }

  const convexEnvironment = {
    BETTER_AUTH_SECRET: "local-e2e-better-auth-secret-0123456789abcdef",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
    OBOE_PUBLIC_URL: "http://localhost:3100",
    OBOE_SERVER_ENVELOPE_SECRET: "local-e2e-server-envelope-secret-0123456789abcdef",
    OBOE_MONEY_WRITES_ENABLED: "true",
    OBOE_ENVIRONMENT: "nonproduction",
    OBOE_NONPRODUCTION_BOOTSTRAP_ENABLED: "true",
    OBOE_SCANNER_URL: "http://127.0.0.1:4100/v1/scan",
    OBOE_SCANNER_AUTH_TOKEN: providerToken,
    OBOE_CUSTODY_URL: "http://127.0.0.1:4100",
    OBOE_CUSTODY_AUTH_TOKEN: providerToken,
    OBOE_CUSTODY_SENDER_ADDRESS: "0x3333333333333333333333333333333333333333",
    OBOE_SETTLEMENT_CONFIRMATIONS: "1",
  };
  for (const [name, value] of Object.entries(convexEnvironment)) {
    run("npx", ["convex", "env", "set", name, value]);
  }

  const playwright = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      CI: process.env.CI ?? "",
      OBOE_PROVIDER_E2E: "true",
      OBOE_FAKE_PROVIDER_TOKEN: providerToken,
      NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
      NEXT_PUBLIC_CONVEX_SITE_URL: "http://127.0.0.1:3211",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
      BETTER_AUTH_SECRET: convexEnvironment.BETTER_AUTH_SECRET,
      OBOE_SERVER_ENVELOPE_SECRET: convexEnvironment.OBOE_SERVER_ENVELOPE_SECRET,
      OBOE_MONEY_WRITES_ENABLED: "true",
      OBOE_V2_GENERAL_AVAILABILITY_APPROVED: "false",
      MPP_RECIPIENT_ESCROW_ADDRESS: "0x1111111111111111111111111111111111111111",
      MPP_FUNDING_TOKEN_ADDRESS: "0x2222222222222222222222222222222222222222",
      MPP_SECRET_KEY: "local-e2e-mpp-secret-0123456789abcdef",
      OBOE_MPP_RPC_URL: "http://127.0.0.1:4100/rpc",
      OBOE_KMS_URL: "http://127.0.0.1:4100",
      OBOE_KMS_AUTH_TOKEN: providerToken,
    },
  });
  if (playwright.status !== 0) process.exitCode = playwright.status ?? 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  stopChildren();
}
