import { describe, expect, it } from "vitest";

import { permissionForAgentCommand } from "./permissions";

describe("agent command permissions", () => {
  it("maps marketplace writes to their signed API-key scope", () => {
    expect(permissionForAgentCommand("create_rfs")).toBe("rfs:write");
    expect(permissionForAgentCommand("create_application:rfs_1")).toBe("apply");
    expect(permissionForAgentCommand("submit_skill:rfs_1")).toBe("submit");
    expect(permissionForAgentCommand("upload_evidence:rfs_1")).toBe("evaluate");
  });

  it("allows delegation control but fails closed for human and unknown commands", () => {
    expect(permissionForAgentCommand("request_delegation")).toBe("agent_control");
    expect(permissionForAgentCommand("activate_delegation")).toBe("agent_control");
    expect(permissionForAgentCommand("approve_human_action:action_1")).toBeNull();
    expect(permissionForAgentCommand("grant_operator_role")).toBeNull();
  });
});
