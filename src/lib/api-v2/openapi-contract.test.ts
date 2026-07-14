import { describe, expect, it } from "vitest";

import { openApiDocument } from "./openapi";

describe("v2 OpenAPI contract", () => {
  it("documents the public catalog and RFS query parameters", () => {
    const catalogParameters = (openApiDocument.paths["/api/v2/catalog"].get as { parameters: Array<{ name: string }> }).parameters;
    const rfsParameters = (openApiDocument.paths["/api/v2/rfs"].get as { parameters: Array<{ name: string }> }).parameters;

    expect(catalogParameters.map((parameter) => parameter.name)).toEqual(["category", "author", "tag", "cursor", "limit"]);
    expect(rfsParameters.map((parameter) => parameter.name)).toEqual(["status", "limit"]);
  });

  it("documents authentication and conflict errors for commands and protected reads", () => {
    const purchaseResponses = (openApiDocument.paths["/api/v2/skills/{skillId}/purchase-intents"].post as { responses: Record<string, unknown> }).responses;
    const contentResponses = (openApiDocument.paths["/api/v2/skills/{skillId}/versions/{versionId}/content"].get as { responses: Record<string, unknown> }).responses;

    expect(purchaseResponses).toHaveProperty("401");
    expect(purchaseResponses).toHaveProperty("409");
    expect(contentResponses).toHaveProperty("401");
  });
});
