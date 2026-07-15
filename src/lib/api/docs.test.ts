import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { API_ROUTE_CONTRACT } from "./contract";
import {
  AGENT_OPERATION_IDS,
  API_REQUEST_EXAMPLES,
  DOCUMENTED_API_ROUTES,
} from "./docs";

describe("contract-driven documentation", () => {
  it("renders every executable route with matching auth and payment metadata", () => {
    expect(DOCUMENTED_API_ROUTES).toEqual(API_ROUTE_CONTRACT);
  });

  it("keeps request examples complete", () => {
    for (const example of Object.values(API_REQUEST_EXAMPLES)) {
      expect(Object.keys(example.body).sort()).toEqual(
        [...example.requiredFields].sort(),
      );
    }
  });

  it("mentions every agent-facing operation in the static agent guide", () => {
    const guide = readFileSync(join(process.cwd(), "public/SKILL.md"), "utf8");
    for (const operationId of AGENT_OPERATION_IDS) {
      const route = API_ROUTE_CONTRACT.find(
        (candidate) => candidate.operationId === operationId,
      );
      expect(route).toBeDefined();
      expect(guide).toContain(`${route?.method} ${route?.path}`);
    }
  });
});
