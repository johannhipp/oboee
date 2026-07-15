import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

const expectNoSeriousAccessibilityIssues = async (page: Page) => {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze()
  const serious = result.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  )
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
}

test("public catalog is usable and never exposes paid content", async ({ page, request }) => {
  const runtimeErrors: Error[] = []
  page.on("pageerror", (error) => runtimeErrors.push(error))

  const response = await request.get("/api/skills")
  expect(response.ok()).toBe(true)
  const catalog = (await response.json()) as { status?: unknown; items?: unknown }
  expect(catalog.status).toBe("ok")
  expect(Array.isArray(catalog.items)).toBe(true)
  expect(JSON.stringify(catalog)).not.toContain("contentMarkdown")

  await page.goto("/")
  await expect(page.getByText("Crowdfunded agent skills")).toBeVisible()
  await page.getByRole("link", { name: "browse" }).click()
  await expect(page).toHaveURL(/\/browse$/)
  await expect(page.getByRole("heading", { name: "Browse" })).toBeVisible()
  await expect(page.getByPlaceholder("search skills and requests...")).toBeVisible()

  await expectNoSeriousAccessibilityIssues(page)
  expect(runtimeErrors).toEqual([])
})

test("mobile public pages do not overflow the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  for (const path of ["/", "/browse", "/docs", "/sign-in"]) {
    await page.goto(path)
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }))
    expect(dimensions.document, `${path} overflows horizontally`).toBeLessThanOrEqual(
      dimensions.viewport,
    )
  }
})

test("signed-in user can save a wallet, create an RFS, and prepare a bound testnet payment", async ({
  page,
}) => {
  const suffix = `${Date.now()}-${test.info().workerIndex}`
  const email = `playwright-${suffix}@oboe.test`
  const title = `Playwright MVP request ${suffix}`
  const wallet = "0x1111111111111111111111111111111111111111"
  const displayName = "Playwright Author With An Intentionally Long Name"

  await page.goto("/sign-in")
  await page.getByRole("button", { name: "create account", exact: true }).click()
  await page.getByLabel("email").fill(email)
  await page.getByLabel("password").fill("OboeDogfood!2026")
  await page.getByLabel("display name").fill(displayName)
  await page.locator("form").getByRole("button", { name: "create account" }).click()

  await expect(page).toHaveURL(/\/me$/)
  await expect(page.getByRole("heading", { name: displayName })).toBeVisible()

  await page.getByLabel("payout wallet").fill(wallet)
  await page.getByRole("button", { name: "save wallet" }).click()
  await expect(page.getByText("Payout wallet saved.")).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByLabel("payout wallet")).toHaveValue(wallet)
  const profileDimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(profileDimensions.document, "wallet profile overflows horizontally").toBeLessThanOrEqual(
    profileDimensions.viewport,
  )
  await page.setViewportSize({ width: 1280, height: 720 })

  await page.getByRole("link", { name: "new rfs" }).click()
  await expect(page.getByLabel("title")).toHaveAttribute("required", "")
  await expect(page.getByLabel("description")).toHaveAttribute("required", "")
  await expect(page.getByLabel("scope")).toHaveAttribute("required", "")
  await expect(page.getByLabel("funding goal")).toHaveAttribute("required", "")
  await page.getByLabel("title").fill(title)
  await page.getByLabel("description").fill("A deterministic browser-level MVP request.")
  await page
    .getByLabel("scope")
    .fill("Cover the compact create, fund, claim, submit, and purchase loop only.")
  await page.getByLabel("tags").fill("playwright,mvp")
  await page.getByLabel("funding goal").fill("0.001")
  await page.getByRole("button", { name: "publish request" }).click()

  await expect(page).toHaveURL(/\/browse\/[a-z0-9]+$/)
  await expect(page.getByRole("heading", { name: title })).toBeVisible()
  await expect(page.getByText(/\$0\.00 \/ \$0\.001/)).toBeVisible()

  await page.getByLabel("amount in pathUSD").fill("0.001")
  const prepareContribution = page.getByRole("button", {
    name: "prepare testnet contribution",
  })
  await prepareContribution.focus()
  await expect(prepareContribution).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.getByText(/Payment required\. Run the Moderato command/)).toBeVisible()

  const command = page.getByLabel("Tempo payment command")
  await expect(command).toContainText("Set MPPX_ACCOUNT")
  await expect(command).toContainText("https://rpc.moderato.tempo.xyz")
  await expect(command).toContainText("mppx sign")
  await expect(command).not.toContainText("MPPX_ACCOUNT=main")
  const copyPaymentCommand = page.getByRole("button", {
    name: "Copy payment command",
  })
  await copyPaymentCommand.focus()
  await expect(copyPaymentCommand).toBeFocused()

  await expectNoSeriousAccessibilityIssues(page)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  const mobileDimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(mobileDimensions.document, "signed-in home overflows horizontally").toBeLessThanOrEqual(
    mobileDimensions.viewport,
  )
  await expect(page.getByRole("button", { name: "sign out", exact: true })).toBeVisible()

  await page.goto("/me")
  await expect(page.getByRole("heading", { name: displayName })).toBeVisible()
  await page.getByRole("button", { name: "sign out", exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("link", { name: "sign in" })).toBeVisible()
})
