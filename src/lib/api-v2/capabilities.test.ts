import { describe, expect, it } from "vitest";

import { skillCapabilities } from "./capabilities";

describe("skill safety capabilities", () => {
  it("does not advertise purchase or content access while a version is held", () => {
    const capabilities = skillCapabilities("skill_1", "version_1", false, true);

    expect(capabilities.find((item) => item.action === "purchase")).toMatchObject({ allowed: false });
    expect(capabilities.find((item) => item.action === "read_content")).toMatchObject({ allowed: false });
  });
});
