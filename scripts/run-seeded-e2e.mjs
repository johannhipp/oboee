import { existsSync, unlinkSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const root = new URL("../", import.meta.url).pathname;
const manifestPath = `${root}.dev/oboe-fixture.json`;
const defaultOrigin = process.env.OBOE_DEV_APP_ORIGIN ?? "http://localhost:3110";
const childEnv = { ...process.env, OBOE_SEEDED_FRONTEND_E2E: "true" };
let fixtureProcess;

const waitFor = async (check, label, timeoutMs = 180_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}.`);
};

const stop = () => {
  if (fixtureProcess && !fixtureProcess.killed) fixtureProcess.kill("SIGTERM");
};

process.on("SIGINT", () => {
  stop();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(143);
});

try {
  if (existsSync(manifestPath)) unlinkSync(manifestPath);
  fixtureProcess = spawn("node", ["scripts/seed-dev.mjs", "--keep-alive"], {
    cwd: root,
    env: childEnv,
    stdio: "inherit",
  });
  fixtureProcess.on("exit", (code) => {
    if (code !== null && code !== 0) process.exitCode = code;
  });
  await waitFor(() => Promise.resolve(existsSync(manifestPath)), "the fixture manifest");
  const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(manifestPath, "utf8"));
  await waitFor(async () => {
    try {
      const response = await fetch(`${manifest.origin ?? defaultOrigin}/sign-in`);
      return response.status < 500;
    } catch {
      return false;
    }
  }, `${manifest.origin ?? defaultOrigin}/sign-in`);
  const result = spawnSync("npx", ["playwright", "test", "e2e/seeded-frontend.spec.ts"], {
    cwd: root,
    env: { ...childEnv, OBOE_TEST_ORIGIN: manifest.origin ?? defaultOrigin },
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  stop();
}
