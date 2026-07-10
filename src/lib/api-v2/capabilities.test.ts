import { describe, expect, it } from "vitest";

import { openApiDocument } from "./openapi";
import { applicationCapabilities, assignmentCapabilities, disputeCapabilities, evaluationCapabilities, evidenceCapabilities, obligationCapabilities, reviewCapabilities } from "./capabilities";

const normalize = (href: string) => href
  .replace(/\/rfs\/[^/]+/g, "/rfs/{rfsId}")
  .replace(/\/applications\/[^/]+/g, "/applications/{applicationId}")
  .replace(/\/evaluations\/[^/]+/g, "/evaluations/{evaluationId}")
  .replace(/\/disputes\/[^/]+/g, "/disputes/{disputeId}")
  .replace(/\/evidence\/[^/]+/g, "/evidence/{artifactId}")
  .replace(/\/skills\/[^/]+/g, "/skills/{skillId}")
  .replace(/\/reviews\/[^/]+/g, "/reviews/{reviewId}");

describe("resource capabilities", () => {
  it("names only implemented and documented routes", () => {
    const capabilities = [
      ...applicationCapabilities("rfs", "application", "active", 1),
      ...assignmentCapabilities("rfs", "application", "selected", true),
      ...evaluationCapabilities("rfs", "evaluation", true),
      ...disputeCapabilities("rfs", "dispute", "open"),
      ...evidenceCapabilities("rfs", "artifact", true),
      ...reviewCapabilities("skill", "review", "pending", true),
      ...obligationCapabilities("pending"),
    ];
    for (const item of capabilities) {
      const path = normalize(item.href);
      expect(openApiDocument.paths[path], `${item.action} ${path}`).toBeDefined();
      expect(openApiDocument.paths[path]?.[item.method.toLowerCase()]).toBeDefined();
    }
  });
});
