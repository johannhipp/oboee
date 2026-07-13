import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const root = new URL("../", import.meta.url).pathname;
const envOrDefault = (name, fallback) => process.env[name]?.trim() || fallback;
// Keep the fixture server separate from the normal development server so its
// public site URL and auth secrets are deterministic and do not depend on an
// already-running Next process.
const origin = envOrDefault("OBOE_DEV_APP_ORIGIN", "http://localhost:3110");
const convexUrl = envOrDefault("NEXT_PUBLIC_CONVEX_URL", "http://127.0.0.1:3210");
const convexSiteUrl = envOrDefault("NEXT_PUBLIC_CONVEX_SITE_URL", "http://127.0.0.1:3211");
const appPort = new URL(origin).port || "3110";
const fixtureName = envOrDefault("OBOE_FIXTURE_NAME", "frontend-complete-v1");
const password = envOrDefault("OBOE_DEV_PASSWORD", "Local-oboe-fixture-42!");
const keepAlive = process.argv.includes("--keep-alive");
const childProcesses = [];

const convexEnvironment = {
  BETTER_AUTH_SECRET:
    envOrDefault("BETTER_AUTH_SECRET", "local-e2e-better-auth-secret-0123456789abcdef"),
  NEXT_PUBLIC_SITE_URL: origin,
  OBOE_PUBLIC_URL: origin,
  OBOE_SERVER_ENVELOPE_SECRET:
    envOrDefault("OBOE_SERVER_ENVELOPE_SECRET", "local-e2e-server-envelope-secret-0123456789abcdef"),
  OBOE_ENVIRONMENT: "nonproduction",
  OBOE_NONPRODUCTION_BOOTSTRAP_ENABLED: "true",
  OBOE_V2_GENERAL_AVAILABILITY_APPROVED: "true",
  OBOE_MONEY_WRITES_ENABLED: "true",
  OBOE_DEV_FIXTURE: "true",
};

const personas = [
  { key: "requester", name: "Fixture Requester", email: "oboe-fixture-requester@example.test" },
  { key: "backer", name: "Fixture Backer", email: "oboe-fixture-backer@example.test" },
  { key: "fulfiller", name: "Fixture Fulfiller", email: "oboe-fixture-fulfiller@example.test" },
  { key: "reviewer", name: "Fixture Reviewer", email: "oboe-fixture-reviewer@example.test" },
  { key: "adjudicator", name: "Fixture Adjudicator", email: "oboe-fixture-adjudicator@example.test" },
  { key: "operator", name: "Fixture Operator", email: "oboe-fixture-operator@example.test" },
  { key: "consumer", name: "Fixture Consumer", email: "oboe-fixture-consumer@example.test" },
];

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status ?? "without a status"}.\n${result.stderr ?? result.stdout ?? ""}`,
    );
  }
  return result.stdout ?? "";
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
    const response = await fetch(url);
    return response.status < 500;
  } catch {
    return false;
  }
};

const stopChildren = () => {
  for (const child of childProcesses.reverse()) {
    if (!child.killed) child.kill("SIGTERM");
  }
};

process.on("SIGINT", () => {
  stopChildren();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopChildren();
  process.exit(143);
});

class CookieJar {
  #cookies = new Map();

  update(response) {
    const values = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")] : []);
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      if (cookieValue) this.#cookies.set(name, cookieValue);
      else this.#cookies.delete(name);
    }
  }

  header() {
    return [...this.#cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

const requestJson = async (path, { method = "GET", body, jar }) => {
  const headers = new Headers({ origin });
  if (body !== undefined) headers.set("content-type", "application/json");
  const cookie = jar?.header();
  if (cookie) headers.set("cookie", cookie);
  if (method !== "GET") headers.set("idempotency-key", randomUUID());
  const response = await fetch(new URL(path, origin), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar?.update(response);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { response, json, text };
};

const ensureAccount = async (spec) => {
  const jar = new CookieJar();
  const signup = await requestJson("/api/auth/sign-up/email", {
    method: "POST",
    body: { name: spec.name, email: spec.email, password },
    jar,
  });
  if (!signup.response.ok) {
    const signin = await requestJson("/api/auth/sign-in/email", {
      method: "POST",
      body: { email: spec.email, password },
      jar,
    });
    if (!signin.response.ok) {
      throw new Error(`Could not sign in ${spec.email}: ${signin.text}`);
    }
  }
  const session = await requestJson("/api/auth/get-session", { jar });
  const principalId = session.json?.user?.id;
  if (typeof principalId !== "string" || !principalId) {
    throw new Error(`The auth session for ${spec.email} did not contain a principal id.`);
  }
  return { ...spec, password, principalId, jar };
};

const ensureRequesterKey = async (account) => {
  const listed = await requestJson("/api/v2/me/agent-keys", { jar: account.jar });
  if (!listed.response.ok) throw new Error(`Could not list fixture agent keys: ${listed.text}`);
  const keys = Array.isArray(listed.json?.data) ? listed.json.data : [];
  const existing = keys.find((key) => key?.name === "fixture-requester-agent");
  if (typeof existing?.id === "string") return existing.id;
  const created = await requestJson("/api/v2/me/agent-keys", {
    method: "POST",
    body: {
      name: "fixture-requester-agent",
      expiresIn: 90 * 24 * 60 * 60,
      permissions: ["rfs:read", "rfs:write", "apply", "submit", "evaluate"],
    },
    jar: account.jar,
  });
  if (!created.response.ok || typeof created.json?.data?.id !== "string") {
    throw new Error(`Could not create the fixture agent key: ${created.text}`);
  }
  return created.json.data.id;
};

const ensureInfrastructure = async () => {
  const childEnv = {
    ...process.env,
    ...convexEnvironment,
    NEXT_PUBLIC_CONVEX_URL: convexUrl,
    NEXT_PUBLIC_CONVEX_SITE_URL: convexSiteUrl,
    CI: "1",
    CONVEX_AGENT_MODE: "anonymous",
  };
  if (!(await isReady(`${convexUrl}/version`))) {
    start("npx", ["convex", "dev", "--typecheck", "disable", "--tail-logs", "disable"], { env: childEnv });
    await waitFor(`${convexUrl}/version`);
  }
  for (const [name, value] of Object.entries(convexEnvironment)) {
    // The local anonymous deployment is selected by CONVEX_DEPLOYMENT in
    // .env.local. Passing --deployment local makes the CLI resolve a cloud
    // deployment name in this project instead of the running local backend.
    run("npx", ["convex", "env", "set", "--force", name, value], { env: childEnv });
  }
  if (!(await isReady(`${origin}/sign-in`))) {
    start("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", appPort], {
      env: childEnv,
    });
    await waitFor(`${origin}/sign-in`);
  }
};

const seed = (seedInput) => {
  const output = run(
    "npx",
    [
      "convex",
      "run",
      "--push",
      "--typecheck",
      "disable",
      "devFixtures:seed",
      JSON.stringify(seedInput),
    ],
    { env: { ...process.env, ...convexEnvironment, CONVEX_AGENT_MODE: "anonymous" } },
  );
  try {
    return JSON.parse(output.trim());
  } catch {
    throw new Error(`Convex returned an unexpected fixture payload:\n${output}`);
  }
};

try {
  await ensureInfrastructure();
  const accounts = [];
  for (const spec of personas) accounts.push(await ensureAccount(spec));
  const requester = accounts.find((account) => account.key === "requester");
  const requesterKeyId = await ensureRequesterKey(requester);
  const seedPersonas = accounts.map(({ key, principalId }) => ({
    key,
    principalId,
    ...(key === "requester" ? { apiKeyId: requesterKeyId } : {}),
  }));
  const result = seed({ fixtureName, reset: true, personas: seedPersonas });
  const manifest = {
    fixtureName: result.fixtureName,
    origin,
    password,
    seededAt: new Date().toISOString(),
    personas: Object.fromEntries(accounts.map((account) => [account.key, {
      email: account.email,
      password,
      principalId: account.principalId,
      ...(account.key === "requester" ? { apiKeyId: requesterKeyId } : {}),
    }])),
    routes: result.routes,
    counts: result.counts,
  };
  mkdirSync(`${root}.dev`, { recursive: true });
  writeFileSync(`${root}.dev/oboe-fixture.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Seeded ${result.fixtureName}: ${result.counts.documents} Convex documents and ${result.counts.storageBlobs} storage blobs.\n`);
  process.stdout.write(`Manifest: ${root}.dev/oboe-fixture.json\n`);
  process.stdout.write(`App: ${origin}\n`);
  process.stdout.write("Personas: requester, backer, fulfiller, reviewer, adjudicator, operator, consumer\n");
  if (keepAlive) {
    process.stdout.write("Fixture dev server is running. Press Ctrl-C to stop it.\n");
    await new Promise(() => {});
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  if (!keepAlive) stopChildren();
}
