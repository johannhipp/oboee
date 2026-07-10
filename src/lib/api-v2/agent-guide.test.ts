import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { openApiDocument } from "./openapi";
import { applicationSchema, bondIntentSchema, evaluationSchema, evidenceVerificationSchema, fixtureRegistrationSchema, fixtureUploadIntentSchema, fundingIntentSchema, postUseReviewSchema, purchaseIntentSchema, rfsDraftSchema } from "./schemas/common";

const guide = readFileSync(resolve(process.cwd(), "public/SKILL.md"), "utf8");

describe("policy-v2 agent guide", () => {
  it("has valid skill frontmatter and names only OpenAPI operations", () => {
    expect(guide).toMatch(/^---\nname: use-oboe\ndescription: .+\n---/);
    const named = [...guide.matchAll(/`(GET|POST|PATCH|DELETE) (\/api\/v2\/[^`?\s]+)(?:\?[^`]*)?`/g)]
      .map(([, method, path]) => ({ method: method.toLowerCase(), path }));
    expect(named.length).toBeGreaterThan(20);
    for (const operation of named) {
      expect(openApiDocument.paths[operation.path as keyof typeof openApiDocument.paths], `${operation.method.toUpperCase()} ${operation.path}`).toHaveProperty(operation.method);
    }
  });

  it("keeps canonical workflow examples accepted by runtime schemas", () => {
    const criterion = { id: "mitigation", title: "Mitigates the issue", passCondition: { kind: "boolean_assertion" as const, assertion: "The isolated regression test passes" }, verificationMethod: "Run the signed fixture before and after", weightBps: 10_000, tags: ["security"], requiredForPublication: true };
    expect(rfsDraftSchema.safeParse({ title: "Mitigate a reproducible vulnerability", description: "The current behavior is vulnerable.", scope: "Produce a reusable skill and signed proof.", tags: ["security"], targetEnvironments: ["node-22"], criteria: [criterion], workEscrowBaseUnits: "1000000", minimumContributionBaseUnits: "10000", tokenAddress: "0x0000000000000000000000000000000000000001", network: "testnet", fundingDurationDays: 14, deliveryDurationDays: 7, consideredResourceIds: [], unmetGapReason: "No published skill covers this environment." }).success).toBe(true);
    expect(applicationSchema.safeParse({ etaMs: 86_400_000, environment: "node-22", criterionPlans: [{ criterionKey: "mitigation", executionMethod: "isolated fixture", expectedResult: "pass", environment: "node-22", evidenceType: "test_result", etaMs: 86_400_000 }], evidenceMethod: "signed before/after proof", relevantWorkReferences: [], bondAcknowledged: true }).success).toBe(true);
    expect(evaluationSchema.safeParse({ skillVersionId: "version_1", targetEnvironment: "node-22", criterionResults: [{ criterionId: "criterion_1", result: "passed", artifactIds: ["artifact_1"] }], narrativeRating: 5, reviewText: "Fixture passed with the expected state transition.", harmful: false }).success).toBe(true);
    expect(postUseReviewSchema.safeParse({ skillVersionId: "version_1", rating: 5, outcome: "resolved", tags: ["security"], text: "The exact version resolved the issue in isolated use.", evidenceArtifactIds: [] }).success).toBe(true);
    expect(fixtureUploadIntentSchema.safeParse({ visibility: "restricted", manifestSha256: "a".repeat(64), bundleSha256: "b".repeat(64), environmentContract: "node-22, no network" }).success).toBe(true);
    expect(fixtureRegistrationSchema.safeParse({ uploadIntentId: "intent_1", storageId: "storage_1" }).success).toBe(true);
    expect(fundingIntentSchema.safeParse({ amountBaseUnits: "10000" }).success).toBe(true);
    expect(purchaseIntentSchema.safeParse({ skillVersionId: "version_1" }).success).toBe(true);
    expect(bondIntentSchema.safeParse({ applicationId: "application_1" }).success).toBe(true);
    expect(evidenceVerificationSchema.safeParse({ outcome: "verified", reason: "Reproduced after scanner clearance." }).success).toBe(true);
  });
});
