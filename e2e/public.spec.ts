import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicPages = ["/", "/browse", "/docs", "/docs/api-v2-migration", "/recovery"];

for (const path of publicPages) {
  test(`${path} has no serious accessibility or horizontal-overflow defects`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
    const violations = await new AxeBuilder({ page }).analyze();
    expect(violations.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("security headers and machine discovery expose the v2 contract", async ({ page, request }) => {
  const response = await page.goto("/docs");
  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  const discovery = await request.get("/.well-known/oboe-agent.json");
  expect(discovery.ok()).toBeTruthy();
  const manifest = await discovery.json();
  expect(manifest.apiVersion).toBe("v2");
  expect(manifest.guide).toMatchObject({ version: "v2", availableForV2: true });
  expect(manifest.openapi).toContain("/api/v2/openapi.json");
  const openapi = await request.get(manifest.openapi);
  expect((await openapi.json()).openapi).toBe("3.1.0");
});

test("retired writes return a non-executing v2 successor", async ({ request }) => {
  const response = await request.post("/api/rfs", { data: { title: "must not execute" } });
  expect(response.status()).toBe(410);
  const body = await response.json();
  expect(body.code).toBe("api_version_retired");
  expect(body.replacement).toEqual({ method: "POST", path: "/api/v2/rfs" });
  expect(body.links.migrationGuide).toBe("/docs/api-v2-migration");
  expect(response.headers()["deprecation"]).toBe("true");
});

test("privileged and owner pages expose no action without authentication", async ({ page }) => {
  for (const path of ["/me", "/review", "/ops", "/new"]) {
    await page.goto(path);
    await expect(page.locator("main, section").first()).toBeVisible();
    await expect(page.getByText(/sign in|unavailable|configured/i).first()).toBeVisible();
  }
});

test("keyboard navigation reaches public commands", async ({ page }) => {
  await page.goto("/docs");
  for (let index = 0; index < 12; index += 1) await page.keyboard.press("Tab");
  const focused = await page.locator(":focus").evaluate((element) => ({ tag: element.tagName, text: element.textContent }));
  expect(["A", "BUTTON", "INPUT", "SELECT"]).toContain(focused.tag);
});

test("docs visual contract", async ({ page }) => {
  test.skip(Boolean(process.env.CI), "Platform-specific visual baselines are reviewed locally.");
  await page.goto("/docs");
  await expect(page).toHaveScreenshot("docs.png", { fullPage: true, animations: "disabled" });
});
