import { describe, expect, it } from "vitest";

import { scannerState } from "./evidencePolicy";

describe("evidence scanner policy", () => {
  it("clears only content-matching malware-free artifacts", () => {
    expect(scannerState({ malwareDetected: false, contentTypeMatches: true, reportReference: "scan-1" })).toBe("clean");
    expect(scannerState({ malwareDetected: true, contentTypeMatches: true, reportReference: "scan-2" })).toBe("quarantined");
    expect(scannerState({ malwareDetected: false, contentTypeMatches: false, reportReference: "scan-3" })).toBe("quarantined");
  });
});
