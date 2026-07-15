import { existsSync, readFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type PersonaKey =
  | "requester"
  | "backer"
  | "fulfiller"
  | "reviewer"
  | "adjudicator"
  | "operator"
  | "consumer";

type Persona = {
  email: string;
  password: string;
  principalId: string;
  apiKeyId?: string;
};

type Routes = {
  openRfsId: string;
  publishedRfsId: string;
  skillId: string;
  authorHandle: string;
  reviewId: string;
  moderationReviewId: string;
  assignmentId: string;
  disputeId: string;
  recoveryId: string;
};

type Fixture = {
  origin: string;
  personas: Record<PersonaKey, Persona>;
  routes: Routes;
};

const fixturePath = `${process.cwd()}/.dev/oboe-fixture.json`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const stringValue = (value: unknown) => (typeof value === "string" ? value : null);

const loadFixture = (): Fixture | null => {
  if (!existsSync(fixturePath)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));
    if (!isRecord(parsed) || !isRecord(parsed.personas) || !isRecord(parsed.routes)) return null;
    const keys: PersonaKey[] = ["requester", "backer", "fulfiller", "reviewer", "adjudicator", "operator", "consumer"];
    const personas = {} as Record<PersonaKey, Persona>;
    for (const key of keys) {
      const value = parsed.personas[key];
      if (!isRecord(value)) return null;
      const email = stringValue(value.email);
      const password = stringValue(value.password);
      const principalId = stringValue(value.principalId);
      if (!email || !password || !principalId) return null;
      personas[key] = {
        email,
        password,
        principalId,
        ...(stringValue(value.apiKeyId) ? { apiKeyId: stringValue(value.apiKeyId)! } : {}),
      };
    }
    const routeKeys: (keyof Routes)[] = [
      "openRfsId",
      "publishedRfsId",
      "skillId",
      "authorHandle",
      "reviewId",
      "moderationReviewId",
      "assignmentId",
      "disputeId",
      "recoveryId",
    ];
    const routes = {} as Routes;
    for (const key of routeKeys) {
      const value = stringValue(parsed.routes[key]);
      if (!value) return null;
      routes[key] = value;
    }
    const origin = stringValue(parsed.origin);
    return origin ? { origin, personas, routes } : null;
  } catch {
    return null;
  }
};

const fixture = loadFixture();

const requireFixture = () => {
  if (!fixture) throw new Error(`Run npm run seed:fixtures first; expected ${fixturePath}.`);
  return fixture;
};

const signIn = async (page: Page, persona: Persona) => {
  const response = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: requireFixture().origin },
    data: { email: persona.email, password: persona.password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
};

const inspectRoute = async (page: Page, path: string, heading: string, text: string) => {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), path).toBe(200);
  await expect(page.getByRole("heading", { name: heading }).first(), path).toBeVisible();
  await expect(page.getByText(text, { exact: false }).first(), path).toBeVisible();
  const violations = await new AxeBuilder({ page }).analyze();
  expect(
    violations.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? "")),
    path,
  ).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} overflow`).toBeLessThanOrEqual(1);
  expect(await page.locator("body").innerText(), path).not.toContain("NaN");
};

test.describe("seeded frontend route matrix", () => {
  test.skip(process.env.OBOE_SEEDED_FRONTEND_E2E !== "true", "Run through npm run test:e2e:seeded.");
  test.skip(!fixture, "Run npm run seed:fixtures first.");

  test("anonymous users still meet the auth boundary", async ({ page }) => {
    await inspectRoute(page, "/me", "Account workspace", "Sign in");
    await inspectRoute(page, "/review", "Review assignments", "Sign in");
    await inspectRoute(page, "/ops", "Operations", "Sign in");
    await page.goto("/new");
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  });

  test("public fixture resources render linked catalog data", async ({ page }) => {
    const data = requireFixture();
    await inspectRoute(page, "/browse", "Marketplace", "Fixture request");
    await inspectRoute(page, `/browse/${data.routes.publishedRfsId}`, "Fixture request: publish a safe security skill", "Acceptance criteria");
    await inspectRoute(page, `/browse/${data.routes.skillId}`, "Fixture request: publish a safe security skill", "Post-use reviews");
    await inspectRoute(page, `/authors/${data.routes.authorHandle}`, "Fixture Fulfiller", "Published skills");
    await inspectRoute(page, `/reviews/${data.routes.reviewId}`, "5/5 · improved", "Author response");
  });

  test("requester, fulfiller, backer, and consumer workspaces render private data", async ({ page }) => {
    const data = requireFixture();
    await signIn(page, data.personas.requester);
    await inspectRoute(page, "/me", "Work", "Fixture request");
    await inspectRoute(page, "/me/actions", "Actions requiring approval", "Confirm the selected fulfiller");
    await inspectRoute(page, "/me/activity", "Activity", "Created a seeded");
    await inspectRoute(page, "/me/earnings", "Settlement", "backer refund");
    await inspectRoute(page, "/me/wallets", "Wallets", "0x1111111111111111111111111111111111111111");
    await inspectRoute(page, "/me/agents", "Agents", "fixture-requester-agent");
    await inspectRoute(page, "/me/security", "Security", "Registered passkeys");
    await inspectRoute(page, "/new", "Create a request", "Acceptance criteria");

    await signIn(page, data.personas.fulfiller);
    await inspectRoute(page, "/me/earnings", "Settlement", "purchase earning");
    await inspectRoute(page, "/me/reputation", "Reputation", "Provisional");

    await signIn(page, data.personas.backer);
    await inspectRoute(page, "/me/wallets", "Wallets", "0x2222222222222222222222222222222222222222");

    await signIn(page, data.personas.consumer);
    await inspectRoute(page, "/me/wallets", "Wallets", "0x7777777777777777777777777777777777777777");
  });

  test("reviewer and adjudicator workspaces render evidence and decisions", async ({ page }) => {
    const data = requireFixture();
    await signIn(page, data.personas.reviewer);
    await inspectRoute(page, "/review", "Review assignments", "Fixture request: publish a safe security skill");
    await inspectRoute(page, `/review/${data.routes.assignmentId}`, "Fixture request: publish a safe security skill", "Evidence");

    await signIn(page, data.personas.adjudicator);
    await inspectRoute(page, "/review/adjudications", "Adjudications", "Fixture request: publish a safe security skill");
    await inspectRoute(page, "/review/moderation", "Review moderation", "Fixture moderation sample");
  });

  test("operator workspace renders every privileged queue", async ({ page }) => {
    const data = requireFixture();
    await signIn(page, data.personas.operator);
    await inspectRoute(page, "/ops", "Operations", "fixture_preview");
    await inspectRoute(page, "/ops/roles", "Platform roles", data.personas.operator.principalId);
    await inspectRoute(page, "/ops/identity", "Identity clusters", data.personas.consumer.principalId);
    await inspectRoute(page, "/ops/payments", "Payment obligations", "fixture-purchase-payout");
    await inspectRoute(page, "/ops/settlements", "Settlement transfers", "local-tempo");
    await inspectRoute(page, "/ops/evidence", "Evidence retention", "legal hold");
    await inspectRoute(page, "/ops/recoveries", "Account recoveries", data.personas.consumer.principalId);
    await inspectRoute(page, "/ops/migrations", "Migrations", "policy-v2-fixture");
    await inspectRoute(page, "/ops/audit", "Operator audit", "fixture.seed");
  });
});
