/// <reference types="vite/client" />

import { anyApi } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const unknownId = "a".repeat(32);

describe("public ID boundaries", () => {
  it("turns wrong-table Convex IDs into public not-found or empty results", async () => {
    const t = convexTest({ schema, modules });

    await expect(t.query(anyApi.skills.getPublic, { skillId: unknownId })).resolves.toBeNull();
    await expect(t.query(anyApi.skills.getVersionMetadata, { skillId: unknownId, skillVersionId: unknownId })).resolves.toBeNull();
    await expect(t.query(anyApi.skills.getInstallAggregate, { skillId: unknownId })).resolves.toEqual({ uniqueVerifiedInstalls: 0, weightedAdoptionUnits: 0 });
    await expect(t.query(anyApi.postUseReviews.publicReview, { reviewId: unknownId })).resolves.toBeNull();
    await expect(t.query(anyApi.postUseReviews.listForSkill, { skillId: unknownId })).resolves.toEqual([]);
    await expect(t.query(anyApi.fixtures.getMetadata, { fixtureVersionId: unknownId })).resolves.toBeNull();
    await expect(t.query(anyApi.accountRecovery.getRecoveryStatus, { requestId: unknownId, statusToken: "token" })).resolves.toBeNull();
    await expect(t.query(anyApi.rfsV2.get, { rfsId: unknownId })).resolves.toBeNull();
    await expect(t.query(anyApi.rfsV2.listRevisions, { rfsId: unknownId })).resolves.toEqual([]);
    await expect(t.query(anyApi.evaluationV2.listPublic, { rfsId: unknownId })).resolves.toEqual([]);
    await expect(t.query(anyApi.evaluationV2.listEvents, { rfsId: unknownId })).resolves.toEqual([]);
    await expect(t.query(anyApi.evidence.listPublicForRfs, { rfsId: unknownId })).resolves.toEqual([]);
    await expect(t.query(anyApi.settlements.getRfsSettlement, { rfsId: unknownId })).resolves.toBeNull();
  });
});
