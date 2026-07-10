import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { Challenge, Credential } from "mppx";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const origin = "http://localhost:3100";
const providerOrigin = "http://127.0.0.1:4100";
const providerToken = process.env.OBOE_FAKE_PROVIDER_TOKEN ?? "local-e2e-provider-token";
const tokenAddress = "0x2222222222222222222222222222222222222222";
const network = "local-tempo";
const chainId = 4_217;
const password = "Local-e2e-password-42!";

type JsonRecord = Record<string, unknown>;
type User = {
  request: APIRequestContext;
  principalId: string;
  walletAddress?: `0x${string}`;
};

const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

const parseJson = async (response: APIResponse, expectedStatus?: number) => {
  const body = await response.json().catch(() => null) as JsonRecord | null;
  if (expectedStatus !== undefined) {
    expect(response.status(), JSON.stringify(body)).toBe(expectedStatus);
  } else {
    expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  }
  return body ?? {};
};

const dataOf = (body: JsonRecord) => body.data as JsonRecord;

const commandHeaders = (idempotencyKey: string = randomUUID()) => ({
  "content-type": "application/json",
  "idempotency-key": idempotencyKey,
  origin,
});

const convexRun = <T>(functionName: string, args: JsonRecord): T => {
  const output = execFileSync("npx", ["convex", "run", functionName, JSON.stringify(args)], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(output.trim()) as T;
};

const convexEnv = (name: string, value: string) => {
  execFileSync("npx", ["convex", "env", "set", name, value], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
};

const signup = async (request: APIRequestContext, runId: string, role: string): Promise<User> => {
  const response = await request.post("/api/auth/sign-up/email", {
    headers: { "content-type": "application/json", origin },
    data: { name: `${role} ${runId}`, email: `${role}-${runId}@example.test`, password },
  });
  await parseJson(response, 200);
  const session = await parseJson(await request.get("/api/auth/get-session"), 200);
  const principalId = (session.user as JsonRecord)?.id;
  expect(principalId).toEqual(expect.any(String));
  return { request, principalId: String(principalId) };
};

const verifyWallet = async (user: User) => {
  const account = privateKeyToAccount(generatePrivateKey());
  const challengeBody = await parseJson(await user.request.post("/api/v2/me/wallet-challenges", {
    headers: commandHeaders(),
    data: { address: account.address, chainId },
  }), 201);
  const challenge = dataOf(challengeBody);
  const message = String(challenge.message);
  const signature = await account.signMessage({ message });
  await parseJson(await user.request.post("/api/v2/me/wallets", {
    headers: commandHeaders(),
    data: { challengeId: challenge.challengeId, message, signature, makePrimary: true },
  }), 201);
  user.walletAddress = account.address;
};

const createAgentKey = async (user: User, permissions: string[]) => {
  const body = await parseJson(await user.request.post("/api/v2/me/agent-keys", {
    headers: commandHeaders(),
    data: { name: "provider-e2e", expiresIn: 24 * 60 * 60, permissions },
  }), 201);
  const key = dataOf(body);
  expect(key.id).toEqual(expect.any(String));
  expect(key.key).toEqual(expect.any(String));
  return { id: String(key.id), secret: String(key.key) };
};

const withAgentKey = async (requestFactory: typeof import("@playwright/test").request, key: string) =>
  await requestFactory.newContext({ baseURL: origin, extraHTTPHeaders: { "x-api-key": key } });

const payIntent = async (args: {
  request: APIRequestContext;
  path: string;
  body: JsonRecord;
  payerAddress: string;
  idempotencyKey?: string;
}) => {
  const idempotencyKey = args.idempotencyKey ?? randomUUID();
  const headers = commandHeaders(idempotencyKey);
  const challengeResponse = await args.request.post(args.path, { headers, data: args.body });
  const challengeBody = Uint8Array.from(await challengeResponse.body());
  expect(challengeResponse.status(), new TextDecoder().decode(challengeBody)).toBe(402);
  const challenge = Challenge.fromResponse(new Response(challengeBody.buffer, {
    status: challengeResponse.status(),
    headers: challengeResponse.headers(),
  }));
  const request = challenge.request as JsonRecord;
  const transactionHash = `0x${sha256(`${idempotencyKey}:${challenge.id}`)}`;
  const registration = await fetch(`${providerOrigin}/mpp/register`, {
    method: "POST",
    headers: { authorization: `Bearer ${providerToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      transactionHash,
      currency: request.currency,
      sender: args.payerAddress,
      recipient: request.recipient,
      amount: request.amount,
    }),
  });
  expect(registration.ok, await registration.text()).toBeTruthy();
  const authorization = Credential.serialize(Credential.from({
    challenge,
    payload: { type: "hash", hash: transactionHash },
    source: `did:pkh:eip155:${chainId}:${args.payerAddress}`,
  }));
  const paid = await args.request.post(args.path, {
    headers: { ...headers, authorization },
    data: args.body,
  });
  return await parseJson(paid, 200);
};

const waitForEvidence = async (request: APIRequestContext, rfsId: string, artifactId: string) => {
  await expect.poll(async () => {
    const body = await parseJson(await request.get(`/api/v2/rfs/${rfsId}/evidence`), 200);
    const rows = body.data as JsonRecord[];
    return rows.find((row) => row.artifactId === artifactId)?.scanState;
  }, { timeout: 20_000 }).toBe("clean");
};

test.describe("isolated provider-backed policy-v2 workflow", () => {
  test.skip(process.env.OBOE_PROVIDER_E2E !== "true", "Run through npm run test:e2e.");
  test.describe.configure({ mode: "serial" });

  test("the published agent guide completes a funded RFS through immutable settlement", async ({ browserName, context, page, playwright }, testInfo) => {
    test.skip(browserName !== "chromium", "Virtual WebAuthn is exercised once in Chromium.");
    test.skip(testInfo.project.name !== "desktop", "The provider workflow runs once against shared state.");
    test.setTimeout(180_000);

    const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const managedContexts: APIRequestContext[] = [];
    const newUser = async (role: string) => {
      const request = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { origin } });
      managedContexts.push(request);
      return await signup(request, runId, role);
    };

    const requester = await signup(context.request, runId, "requester");
    const backer = await newUser("backer");
    const fulfiller = await newUser("fulfiller");
    const reviewer = await newUser("reviewer");
    const platform = await newUser("platform");
    const consumer = await newUser("consumer");

    try {
      const principals = [requester, backer, fulfiller, reviewer, platform, consumer].map((user) => user.principalId);
      convexRun("platform:bootstrapPolicyV2Cohort", {
        principalIds: principals,
        reason: `isolated provider E2E ${runId}`,
      });
      convexRun("platform:bootstrapPlatformRole", {
        principalId: reviewer.principalId,
        role: "trusted_reviewer",
        tags: ["security"],
        activeUntil: Date.now() + 24 * 60 * 60 * 1_000,
        reason: `isolated provider E2E ${runId}`,
        bootstrapActorPrincipalId: "system:provider-e2e",
      });
      convexEnv("OBOE_PLATFORM_PRINCIPAL_ID", platform.principalId);

      for (const user of [requester, backer, fulfiller, reviewer, platform, consumer]) {
        await verifyWallet(user);
      }

      const cdp = await context.newCDPSession(page);
      await cdp.send("WebAuthn.enable");
      await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      });
      await page.goto("/me/security");
      await page.getByRole("button", { name: "add passkey" }).click();
      await expect(page.getByRole("status")).toContainText("Passkey registered");

      const requesterKey = await createAgentKey(requester, ["rfs:read", "rfs:write", "fund", "apply", "submit", "evaluate", "purchase", "settlement:read"]);
      const requesterAgent = await withAgentKey(playwright.request, requesterKey.secret);
      managedContexts.push(requesterAgent);
      const bounds = {
        apiKeyId: requesterKey.id,
        name: "bounded local funding",
        permissions: ["fund"],
        actions: ["create_funding_intent"],
        resourceAllowlist: [],
        tagAllowlist: ["security"],
        perTransactionCapBaseUnits: "10000000",
        rolling24HourCapBaseUnits: "10000000",
        lifetimeCapBaseUnits: "10000000",
        tokenAddress,
        network,
        expiresAt: Date.now() + 60 * 60 * 1_000,
      };
      const delegationRequestBody = await parseJson(await requesterAgent.post("/api/v2/me/delegations", {
        headers: commandHeaders(),
        data: bounds,
      }), 202);
      const delegationRequest = dataOf(delegationRequestBody);
      const actionId = String(delegationRequest.requestId);
      const operationId = String(delegationRequest.operationId);

      const forbiddenApproval = await requesterAgent.post(`/api/v2/me/human-actions/${actionId}/approve`, {
        headers: commandHeaders(), data: {},
      });
      expect(forbiddenApproval.status()).toBe(403);

      await page.goto("/me/actions");
      await page.getByRole("button", { name: "verify passkey" }).click();
      await expect(page.getByRole("status")).toContainText("Passkey verified");
      await page.getByRole("button", { name: "approve" }).click();
      await expect(page.getByText("No pending human actions.")).toBeVisible();

      const operation = await requesterAgent.get(`/api/v2/operations/${operationId}`);
      const operationBody = await parseJson(operation, 200);
      expect(dataOf(operationBody).status).toBe("succeeded");
      const notModified = await requesterAgent.get(`/api/v2/operations/${operationId}`, {
        headers: { "if-none-match": operation.headers().etag },
      });
      expect(notModified.status()).toBe(304);

      await parseJson(await requesterAgent.post("/api/v2/me/delegations/activate", {
        headers: commandHeaders(),
        data: { approvalRequestId: actionId, ...bounds },
      }), 201);

      const draft = {
        title: `Mitigate isolated request vulnerability ${runId}`,
        description: "Provide a reusable skill that detects and mitigates the supplied vulnerable request pattern.",
        scope: "One deterministic local fixture and one required security criterion.",
        tags: ["security"],
        targetEnvironments: ["node-local"],
        criteria: [{
          id: "mitigation",
          title: "Mitigation succeeds",
          passCondition: { kind: "boolean_assertion", assertion: "The vulnerable request is rejected after applying the skill." },
          verificationMethod: "Signed before/after proof with independent replay",
          weightBps: 10_000,
          tags: ["security"],
          requiredForPublication: true,
        }],
        workEscrowBaseUnits: "1000000",
        minimumContributionBaseUnits: "10000",
        tokenAddress,
        network,
        fundingDurationDays: 1,
        deliveryDurationDays: 1,
        consideredResourceIds: [],
        unmetGapReason: "No existing result covers this isolated fixture.",
      };
      await parseJson(await requesterAgent.post("/api/v2/rfs/similar", {
        headers: commandHeaders(), data: { title: draft.title, tags: draft.tags, limit: 5 },
      }), 200);
      const validation = await parseJson(await requesterAgent.post("/api/v2/rfs/validate", {
        headers: commandHeaders(), data: draft,
      }), 200);
      expect(dataOf(validation).valid).toBe(true);
      const totalFundingTarget = BigInt(String(dataOf(validation).totalFundingTargetBaseUnits));
      const requesterFunding = totalFundingTarget / BigInt(2);
      const backerFunding = totalFundingTarget - requesterFunding;
      const createIdempotencyKey = randomUUID();
      const created = await parseJson(await requesterAgent.post("/api/v2/rfs", {
        headers: commandHeaders(createIdempotencyKey), data: draft,
      }), 201);
      const rfsId = String(dataOf(created).rfsId);
      const replay = await parseJson(await requesterAgent.post("/api/v2/rfs", {
        headers: commandHeaders(createIdempotencyKey), data: draft,
      }), 200);
      expect(dataOf(replay).rfsId).toBe(rfsId);

      await payIntent({
        request: requesterAgent,
        path: `/api/v2/rfs/${rfsId}/funding-intents`,
        body: { amountBaseUnits: requesterFunding.toString() },
        payerAddress: requester.walletAddress!,
      });
      await payIntent({
        request: backer.request,
        path: `/api/v2/rfs/${rfsId}/funding-intents`,
        body: { amountBaseUnits: backerFunding.toString() },
        payerAddress: backer.walletAddress!,
      });
      const funded = await parseJson(await requesterAgent.get(`/api/v2/rfs/${rfsId}`), 200);
      expect((dataOf(funded).rfs as JsonRecord).status).toBe("funded");

      const fulfillerKey = await createAgentKey(fulfiller, ["rfs:read", "apply", "submit"]);
      const fulfillerAgent = await withAgentKey(playwright.request, fulfillerKey.secret);
      managedContexts.push(fulfillerAgent);
      const outOfScope = await fulfillerAgent.post("/api/v2/rfs/validate", {
        headers: commandHeaders(), data: draft,
      });
      const outOfScopeBody = await parseJson(outOfScope, 403);
      expect(outOfScopeBody).toMatchObject({ code: "forbidden", requiredPermission: "rfs:write" });
      const financialRead = await parseJson(await fulfillerAgent.get("/api/v2/me/obligations"), 403);
      expect(financialRead).toMatchObject({ code: "forbidden", requiredPermission: "settlement:read" });
      const application = await parseJson(await fulfillerAgent.post(`/api/v2/rfs/${rfsId}/applications`, {
        headers: commandHeaders(),
        data: {
          etaMs: 3_600_000,
          environment: "node-local",
          criterionPlans: [{ criterionKey: "mitigation", executionMethod: "isolated replay", expectedResult: "request rejected", environment: "node-local", evidenceType: "signed_test_result", etaMs: 3_600_000 }],
          evidenceMethod: "Ed25519 signed before/after hashes",
          relevantWorkReferences: [],
          bondAcknowledged: true,
        },
      }), 201);
      const applicationId = String(dataOf(application).applicationId);
      const selection = convexRun<{ state: string; selectedApplicationId?: string }>("applications:closeApplications", { rfsId, now: Date.now() + 3 * 24 * 60 * 60 * 1_000 });
      expect(selection).toMatchObject({ state: "assigned", selectedApplicationId: applicationId });

      const contentMarkdown = "# Request mitigation\n\nReject the fixture request when the vulnerable marker is present.";
      const submission = await parseJson(await fulfillerAgent.post(`/api/v2/rfs/${rfsId}/submissions`, {
        headers: commandHeaders(),
        data: { contentMarkdown, summary: "Deterministic request mitigation", tags: ["security"], purchasePriceBaseUnits: "50000" },
      }), 201);
      const submitted = dataOf(submission);
      const skillId = String(submitted.skillId);
      const skillVersionId = String(submitted.skillVersionId);
      const evaluationDeadline = Number(submitted.evaluationDeadline);

      const workspace = await parseJson(await requesterAgent.get(`/api/v2/rfs/${rfsId}/evaluation-workspace`), 200);
      const criterion = (dataOf(workspace).criteria as JsonRecord[])[0];
      const criterionId = String(criterion.criterionId ?? criterion._id);

      const proofPrivateKey = ed25519.utils.randomPrivateKey();
      const proofPublicKey = bytesToHex(ed25519.getPublicKey(proofPrivateKey));
      const keyChallengeBody = await parseJson(await requesterAgent.post("/api/v2/me/signing-key-challenges", {
        headers: commandHeaders(), data: { publicKey: proofPublicKey },
      }), 201);
      const keyChallenge = dataOf(keyChallengeBody);
      const keyChallengeText = String(keyChallenge.challenge);
      const proofKey = await parseJson(await requesterAgent.post("/api/v2/me/signing-keys", {
        headers: commandHeaders(),
        data: {
          challengeId: keyChallenge.challengeId,
          challenge: keyChallengeText,
          signature: bytesToHex(ed25519.sign(utf8ToBytes(keyChallengeText), proofPrivateKey)),
        },
      }), 201);
      const signingKeyId = String(dataOf(proofKey).keyId);

      const evidenceText = JSON.stringify({ before: "vulnerable", after: "rejected", assertion: true });
      const proofManifest = JSON.stringify({
        rfsId,
        skillVersionId,
        criterionId,
        contentSha256: sha256(evidenceText),
        fixtureDigest: sha256("local-vulnerable-request-fixture"),
        runtime: "node-local",
        toolVersions: { harness: "provider-e2e-v1" },
        normalizedInputs: { fixture: "request-v1" },
        beforeStateHash: sha256("vulnerable"),
        afterStateHash: sha256("rejected"),
        assertions: [{ name: "request_rejected", passed: true }],
        timestamp: Date.now(),
      });
      const evidenceForm = new FormData();
      evidenceForm.set("file", new File([evidenceText], "proof.json", { type: "application/json" }));
      evidenceForm.set("skillVersionId", skillVersionId);
      evidenceForm.set("criterionId", criterionId);
      evidenceForm.set("classification", "public");
      evidenceForm.set("proofManifest", proofManifest);
      evidenceForm.set("proofSignature", bytesToHex(ed25519.sign(utf8ToBytes(proofManifest), proofPrivateKey)));
      evidenceForm.set("signingKeyId", signingKeyId);
      const evidence = await parseJson(await requesterAgent.post(`/api/v2/rfs/${rfsId}/evidence/upload-intents`, {
        headers: { "idempotency-key": randomUUID() },
        multipart: evidenceForm,
      }), 201);
      const artifactId = String(dataOf(evidence).artifactId);
      await waitForEvidence(requesterAgent, rfsId, artifactId);

      const initialEvaluation = await parseJson(await requesterAgent.post(`/api/v2/rfs/${rfsId}/evaluations`, {
        headers: commandHeaders(),
        data: {
          skillVersionId,
          targetEnvironment: "node-local",
          criterionResults: [{ criterionId, result: "passed", artifactIds: [artifactId] }],
          narrativeRating: 5,
          reviewText: "The exact version rejected the vulnerable fixture.",
          harmful: false,
        },
      }), 201);
      const initialEvaluationId = String(dataOf(initialEvaluation).evaluationId);
      const extension = convexRun<{ state: string }>("evaluationV2:closeDueEvaluation", { skillVersionId, now: evaluationDeadline + 1 });
      expect(extension.state).toBe("extended");

      const assignmentsBody = await parseJson(await reviewer.request.get("/api/v2/review-assignments"), 200);
      const assignment = (assignmentsBody.data as JsonRecord[]).find((row) => row.rfsId === rfsId || row.assessmentId === submitted.assessmentId);
      expect(assignment).toBeDefined();
      const assignmentId = String(assignment?._id ?? assignment?.assignmentId);
      await parseJson(await reviewer.request.post(`/api/v2/review-assignments/${assignmentId}/accept`, {
        headers: commandHeaders(), data: {},
      }), 200);
      await parseJson(await reviewer.request.post(`/api/v2/review-assignments/${assignmentId}/evidence/${artifactId}/verify`, {
        headers: commandHeaders(), data: { outcome: "verified", reason: "Independent local replay matched the signed proof." },
      }), 200);

      await parseJson(await requesterAgent.post(`/api/v2/rfs/${rfsId}/evaluations/${initialEvaluationId}/supersede`, {
        headers: commandHeaders(),
        data: {
          criterionResults: [{ criterionId, result: "passed", artifactIds: [artifactId] }],
          reviewText: "Superseded after independent proof verification.",
          harmful: false,
        },
      }), 201);
      await parseJson(await reviewer.request.post(`/api/v2/rfs/${rfsId}/evaluations`, {
        headers: commandHeaders(),
        data: {
          skillVersionId,
          targetEnvironment: "node-local",
          criterionResults: [{ criterionId, result: "passed", artifactIds: [artifactId] }],
          narrativeRating: 5,
          reviewText: "Independent reviewer reproduced the required mitigation.",
          harmful: false,
        },
      }), 201);
      await parseJson(await reviewer.request.post(`/api/v2/review-assignments/${assignmentId}/complete`, {
        headers: commandHeaders(), data: {},
      }), 200);

      const closure = convexRun<{ state: string }>("evaluationV2:closeDueEvaluation", { skillVersionId, now: evaluationDeadline + 30 * 24 * 60 * 60 * 1_000 });
      expect(closure.state).toBe("finalized");
      const published = await parseJson(await requesterAgent.get(`/api/v2/skills/${skillId}`), 200);
      expect(dataOf(published).status).toBe("published");

      const armed = await fetch(`${providerOrigin}/control/custody-lost-response-once`, {
        method: "POST", headers: { authorization: `Bearer ${providerToken}` },
      });
      expect(armed.ok).toBeTruthy();
      const settlementRun = convexRun<{ prepared: number; processed: number; confirmed: number; failed: number }>("settlements:processSettlementOutbox", { limit: 25 });
      expect(settlementRun.failed).toBe(0);
      expect(settlementRun.confirmed).toBeGreaterThan(0);
      const settlement = await parseJson(await requesterAgent.get(`/api/v2/rfs/${rfsId}/settlement`), 200);
      const settledBeforeReview = dataOf(settlement);
      expect((settledBeforeReview.obligations as JsonRecord[]).every((row) => row.state === "settled")).toBe(true);

      await payIntent({
        request: consumer.request,
        path: `/api/v2/skills/${skillId}/purchase-intents`,
        body: { skillVersionId },
        payerAddress: consumer.walletAddress!,
      });
      const content = await parseJson(await consumer.request.get(`/api/v2/skills/${skillId}/versions/${skillVersionId}/content`), 200);
      expect(dataOf(content)).toMatchObject({ contentMarkdown, installRecorded: true });
      const review = await parseJson(await consumer.request.post(`/api/v2/skills/${skillId}/reviews`, {
        headers: commandHeaders(),
        data: { skillVersionId, rating: 5, outcome: "resolved", tags: ["security"], text: "The exact version resolved the isolated issue.", evidenceArtifactIds: [] },
      }), 201);
      const reviewId = String(dataOf(review).reviewId);
      await parseJson(await consumer.request.post(`/api/v2/skills/${skillId}/reviews/${reviewId}/revisions`, {
        headers: commandHeaders(),
        data: { rating: 4, outcome: "improved", tags: ["security"], text: "Revised after a second isolated run.", evidenceArtifactIds: [] },
      }), 200);
      await parseJson(await fulfiller.request.post(`/api/v2/skills/${skillId}/reviews/${reviewId}/response`, {
        headers: commandHeaders(), data: { text: "Acknowledged; the next version will cover the remaining case." },
      }), 201);
      convexRun("postUseReviews:finalizeDue", { now: Date.now() + 8 * 24 * 60 * 60 * 1_000, limit: 20 });
      const settlementAfterReview = dataOf(await parseJson(await requesterAgent.get(`/api/v2/rfs/${rfsId}/settlement`), 200));
      expect(settlementAfterReview.obligations).toEqual(settledBeforeReview.obligations);

      await fulfillerAgent.dispose();
      const resumedAgent = await withAgentKey(playwright.request, fulfillerKey.secret);
      managedContexts.push(resumedAgent);
      await parseJson(await resumedAgent.get("/api/v2/me/work"), 200);
      const activity = await parseJson(await resumedAgent.get("/api/v2/me/activity?cursor=0"), 200);
      expect((activity.data as unknown[]).length).toBeGreaterThan(0);

      const retired = await requesterAgent.post("/api/rfs", { data: { title: "must not execute" } });
      const retiredBody = await parseJson(retired, 410);
      expect(retiredBody).toMatchObject({ code: "api_version_retired", replacement: { method: "POST", path: "/api/v2/rfs" } });
    } finally {
      await Promise.allSettled(managedContexts.map(async (request) => await request.dispose()));
    }
  });
});
